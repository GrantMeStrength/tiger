const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");
const path = require("path");
const fs = require("fs");
const os = require("os");

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

// PTY registry shared with src/lib/agents.ts via global
// Key: agentId, Value: IPty instance
if (!global.__tigerPtys) {
  global.__tigerPtys = new Map();
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
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
    const pty = global.__tigerPtys.get(agentId);

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

  server.on("upgrade", (req, socket, head) => {
    if (req.url && req.url.startsWith("/ws/terminal/")) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Tiger ready on http://${hostname}:${port}`);
  });
});
