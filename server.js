const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");
const path = require("path");
const fs = require("fs");
const os = require("os");
const nodePty = require("node-pty");

// Load and apply settings from ~/.tiger/settings.json at startup
function applySettingsFromFile() {
  const settingsPath = path.join(os.homedir(), ".tiger", "settings.json");
  try {
    const raw = fs.readFileSync(settingsPath, "utf-8");
    const s = JSON.parse(raw);
    if (s.githubToken) process.env.GITHUB_TOKEN = s.githubToken;
    if (s.aiKey) process.env.OPENAI_API_KEY = s.aiKey;
    if (s.aiBaseUrl) process.env.OPENAI_BASE_URL = s.aiBaseUrl;
    console.log("> Tiger: settings loaded from ~/.tiger/settings.json");
  } catch {
    console.log("> Tiger: no settings file yet — configure via ⚙ Settings");
  }
}
applySettingsFromFile();

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// PTY registry — local to server.js only, avoids Next.js module isolation issues
const ptyMap = new Map();

function spawnPty(agentId, cwd, command, args, initialInput, projectId) {
  const port = process.env.PORT || "3000";
  const memoryDir = path.join(os.homedir(), ".tiger", "memory");
  if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });

  // Ensure cwd exists — fall back to home dir so bash always starts
  const safeCwd = (cwd && fs.existsSync(cwd)) ? cwd : os.homedir();
  if (safeCwd !== cwd) {
    console.warn(`[Tiger] cwd "${cwd}" not found — starting terminal in home dir`);
  }

  const tigerEnv = projectId
    ? {
        TIGER_PROJECT_ID: projectId,
        TIGER_PORT: port,
        TIGER_API_BASE_URL: `http://localhost:${port}/api`,
        TIGER_PLAN_URL: `http://localhost:${port}/api/projects/${encodeURIComponent(projectId)}/plan`,
        TIGER_MEMORY_FILE: path.join(memoryDir, `${projectId}.md`),
        TIGER_MEMORY_URL: `http://localhost:${port}/api/projects/${encodeURIComponent(projectId)}/memory`,
      }
    : {};
  const ptyProcess = nodePty.spawn(command || "bash", args || [], {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: safeCwd,
    env: { ...process.env, TERM: "xterm-256color", ...tigerEnv },
  });
  ptyMap.set(agentId, ptyProcess);
  // Keep entry in map for 5 s after exit so a racing WebSocket connection can
  // still connect and receive the exit message rather than "session not found".
  ptyProcess.onExit(({ exitCode }) => {
    setTimeout(() => ptyMap.delete(agentId), 5000);
    console.log(`[Tiger] PTY ${agentId} exited with code ${exitCode}`);
  });
  if (initialInput) {
    setTimeout(() => ptyProcess.write(initialInput + "\r"), 500);
  }
  return ptyProcess.pid;
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    // Internal PTY management — called from Next.js API routes
    if (req.method === "POST" && req.url === "/_tiger/spawn-pty") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const { agentId, projectId, cwd, command, args, initialInput } = JSON.parse(body);
          const pid = spawnPty(agentId, cwd, command, args, initialInput, projectId);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ pid }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/_tiger/kill-pty") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        try {
          const { agentId } = JSON.parse(body);
          const ptyProc = ptyMap.get(agentId);
          if (ptyProc) { ptyProc.kill(); ptyMap.delete(agentId); }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request:", err);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (ws, req) => {
    // URL format: /ws/terminal/<agentId>
    const agentId = req.url.replace("/ws/terminal/", "");
    const pty = ptyMap.get(agentId);

    if (!pty) {
      ws.send("\r\n[Tiger] Terminal session not found or already closed.\r\n");
      ws.close();
      return;
    }

    // PTY → WebSocket
    const dataHandler = pty.onData((data) => {
      if (ws.readyState === ws.OPEN) ws.send(data);
    });

    const exitHandler = pty.onExit(({ exitCode }) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n[Tiger] Process exited with code ${exitCode}\r\n`);
        ws.close();
      }
    });

    // WebSocket → PTY
    ws.on("message", (msg) => {
      const data = msg.toString();
      // Resize message format: {"type":"resize","cols":N,"rows":N}
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "resize") {
          pty.resize(parsed.cols, parsed.rows);
          return;
        }
      } catch {
        // Not JSON — treat as terminal input
      }
      pty.write(data);
    });

    ws.on("close", () => {
      dataHandler.dispose();
      exitHandler.dispose();
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      dataHandler.dispose();
      exitHandler.dispose();
    });
  });

  // Get Next.js's own upgrade handler so HMR websockets work in dev
  const nextUpgradeHandler = app.getUpgradeHandler?.();

  server.on("upgrade", (req, socket, head) => {
    if (req.url && req.url.startsWith("/ws/terminal/")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (nextUpgradeHandler) {
      // Delegate HMR and other Next.js WebSocket connections back to Next.js
      nextUpgradeHandler(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Tiger ready on http://${hostname}:${port}`);
  });
});
