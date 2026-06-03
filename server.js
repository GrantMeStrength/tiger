/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { WebSocketServer } = require("ws");
const path = require("path");
const fs = require("fs");
const os = require("os");
const nodePty = require("node-pty");

// Lazy require so server starts even before npm install
let CopilotClient, approveAll;
try {
  const sdk = require("@github/copilot-sdk");
  CopilotClient = sdk.CopilotClient;
  approveAll = sdk.approveAll;
} catch (e) {
  console.warn("[Tiger] @github/copilot-sdk not available:", e.message);
}

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

// Scrollback buffers — replay full PTY history when a client reconnects after navigation
const scrollbackMap = new Map(); // agentId → Buffer[]
const MAX_SCROLLBACK_BYTES = 2 * 1024 * 1024; // 2 MB per agent

// Exit records — track PTYs that exited during the 5-second grace window so a
// racing WS connection can still receive the exit event even though onExit already fired.
const exitedMap = new Map(); // agentId → { exitCode }

const copilotClientMap = new Map(); // projectId → CopilotClient
const copilotSessionMap = new Map(); // agentId → { session, projectId, events: [], unsubscribe }
const copilotWsMap = new Map(); // agentId → Set<WebSocket>

const AGENTS_DIR = path.join(os.homedir(), ".tiger", "agents");

function sendJson(ws, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastCopilotEvent(agentId, event) {
  const clients = copilotWsMap.get(agentId);
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify({ type: "event", event });
  for (const client of clients) {
    if (client.readyState === client.OPEN) {
      client.send(payload);
    }
  }
}

async function getCopilotClient(projectId, repoPath) {
  const existing = copilotClientMap.get(projectId);
  if (existing) return existing;
  if (!CopilotClient) {
    throw new Error("@github/copilot-sdk is not installed");
  }

  const baseDirectory = path.join(os.homedir(), ".tiger", "copilot-sessions", projectId);
  fs.mkdirSync(baseDirectory, { recursive: true });

  const client = new CopilotClient({
    workingDirectory: repoPath,
    baseDirectory,
  });
  await client.start();
  copilotClientMap.set(projectId, client);
  return client;
}

async function disconnectCopilotSession(agentId) {
  const entry = copilotSessionMap.get(agentId);
  if (!entry) return;

  try {
    await entry.session.disconnect();
  } finally {
    try {
      entry.unsubscribe?.();
    } catch {
      // ignore cleanup errors
    }
    copilotSessionMap.delete(agentId);
    const clients = copilotWsMap.get(agentId);
    if (clients) {
      for (const client of clients) {
        try {
          client.close();
        } catch {
          // ignore socket cleanup errors
        }
      }
      copilotWsMap.delete(agentId);
    }
  }
}

async function spawnCopilotSdk(agentId, projectId, repoPath, initialPrompt, model) {
  const existing = copilotSessionMap.get(agentId);
  if (existing) return { ok: true };

  const client = await getCopilotClient(projectId, repoPath);

  let session;
  try {
    session = await client.resumeSession(agentId);
  } catch {
    session = await client.createSession({
      sessionId: agentId,
      onPermissionRequest: approveAll,
      model: model || undefined,
    });
  }

  const entry = {
    session,
    projectId,
    events: [],
    isIdle: true,   // assume idle; user.message will flip to false if busy
    unsubscribe: null,
  };

  entry.unsubscribe = session.on((event) => {
    entry.events.push(event);
    broadcastCopilotEvent(agentId, event);
    if (event.type === "session.idle") {
      entry.isIdle = true;
      notifyAgentUpdate(projectId, agentId, { status: "running", pid: null });
    } else if (event.type === "user.message") {
      entry.isIdle = false;
    }
  });

  copilotSessionMap.set(agentId, entry);

  if (initialPrompt) {
    await session.send({ prompt: initialPrompt });
  }

  return { ok: true };
}

// Notify the Next.js agent registry about a lifecycle change.
// This keeps the in-memory registry in sync so the UI reflects the correct status.
// Fire-and-forget — errors are logged but not fatal; disk is the fallback.
function notifyAgentUpdate(projectId, agentId, updates) {
  if (!projectId) return;
  fetch(`http://localhost:${port}/api/projects/${encodeURIComponent(projectId)}/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  }).catch((err) => console.warn(`[Tiger] Failed to notify agent update for ${agentId}:`, err));
}

// Write a single agent record's lifecycle fields directly to disk.
// Used as a belt-and-suspenders backup alongside notifyAgentUpdate.
function updateAgentOnDisk(agentId, projectId, updates) {
  if (!projectId) return;
  const file = path.join(AGENTS_DIR, `${projectId}.json`);
  try {
    const records = JSON.parse(fs.readFileSync(file, "utf-8"));
    const idx = records.findIndex((r) => r.id === agentId);
    if (idx !== -1) {
      records[idx] = { ...records[idx], ...updates };
      fs.writeFileSync(file, JSON.stringify(records, null, 2), "utf-8");
    }
  } catch { /* file not yet written — ignore */ }
}

function spawnPty(agentId, cwd, command, args, initialInput, projectId) {
  const portValue = process.env.PORT || "3000";
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
        TIGER_PORT: portValue,
        TIGER_API_BASE_URL: `http://localhost:${portValue}/api`,
        TIGER_PLAN_URL: `http://localhost:${portValue}/api/projects/${encodeURIComponent(projectId)}/plan`,
        TIGER_MEMORY_FILE: path.join(memoryDir, `${projectId}.md`),
        TIGER_MEMORY_URL: `http://localhost:${portValue}/api/projects/${encodeURIComponent(projectId)}/memory`,
      }
    : {};
  const ptyProcess = nodePty.spawn(command || "bash", args || [], {
    name: "xterm-256color",
    cols: 120,
    rows: 40,
    cwd: safeCwd,
    env: { ...process.env, TERM: "xterm-256color", ...tigerEnv },
  });
  const pid = ptyProcess.pid;
  ptyMap.set(agentId, ptyProcess);

  // Accumulate PTY output so any future client can replay full history on reconnect
  const chunks = [];
  let totalBytes = 0;
  scrollbackMap.set(agentId, chunks);
  ptyProcess.onData((data) => {
    const buf = Buffer.from(data, "binary");
    chunks.push(buf);
    totalBytes += buf.length;
    // Trim oldest chunks if over limit (keeps recent output)
    while (totalBytes > MAX_SCROLLBACK_BYTES && chunks.length > 0) {
      totalBytes -= chunks[0].length;
      chunks.shift();
    }
  });

  // Keep entry in maps for 5 s after exit so a racing WebSocket connection can
  // still receive the scrollback and exit event rather than "session not found".
  ptyProcess.onExit(({ exitCode }) => {
    const status = exitCode === 0 ? "completed" : "failed";
    const update = {
      status,
      exitCode,
      completedAt: new Date().toISOString(),
      pid: null,
      expectedPid: pid,
    };
    notifyAgentUpdate(projectId, agentId, update);
    updateAgentOnDisk(agentId, projectId, update);
    exitedMap.set(agentId, { exitCode: exitCode ?? 0 });
    setTimeout(() => {
      ptyMap.delete(agentId);
      scrollbackMap.delete(agentId);
      exitedMap.delete(agentId);
    }, 5000);
    console.log(`[Tiger] PTY ${agentId} exited with code ${exitCode}`);
  });
  if (initialInput) {
    setTimeout(() => ptyProcess.write(initialInput + "\r"), 500);
  }
  return ptyProcess.pid;
}

function handleTerminalConnection(ws, req) {
  const [rawPath, rawQuery] = (req.url || "").split("?");
  const agentId = decodeURIComponent(rawPath.replace("/ws/terminal/", ""));
  const skipScrollback = new URLSearchParams(rawQuery || "").get("skipScrollback") === "1";
  const pty = ptyMap.get(agentId);

  if (!pty) {
    sendJson(ws, { type: "not_found" });
    ws.close();
    return;
  }

  if (!skipScrollback) {
    const chunks = scrollbackMap.get(agentId);
    if (chunks && chunks.length > 0) {
      for (const chunk of chunks) {
        if (ws.readyState === ws.OPEN) ws.send(chunk);
      }
    }
  }

  if (ws.readyState === ws.OPEN) {
    sendJson(ws, { type: "connected" });
  }

  const exitInfo = exitedMap.get(agentId);
  if (exitInfo !== undefined) {
    if (ws.readyState === ws.OPEN) {
      sendJson(ws, { type: "exit", exitCode: exitInfo.exitCode });
      ws.close();
    }
    return;
  }

  const dataHandler = pty.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(Buffer.from(data, "binary"));
  });

  const exitHandler = pty.onExit(({ exitCode }) => {
    if (ws.readyState === ws.OPEN) {
      sendJson(ws, { type: "exit", exitCode: exitCode ?? 0 });
      ws.close();
    }
  });

  ws.on("message", (msg) => {
    const data = msg.toString();
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
}

async function handleCopilotConnection(ws, req) {
  const [rawPath] = (req.url || "").split("?");
  const agentId = decodeURIComponent(rawPath.replace("/ws/copilot/", ""));
  const entry = copilotSessionMap.get(agentId);

  if (!entry) {
    sendJson(ws, { type: "not_found" });
    ws.close();
    return;
  }

  try {
    const history = await entry.session.getEvents();
    sendJson(ws, { type: "connected", history, isIdle: entry.isIdle });
  } catch (err) {
    console.error(`[Tiger] Failed to load Copilot history for ${agentId}:`, err);
    sendJson(ws, { type: "not_found" });
    ws.close();
    return;
  }

  let clients = copilotWsMap.get(agentId);
  if (!clients) {
    clients = new Set();
    copilotWsMap.set(agentId, clients);
  }
  clients.add(ws);

  const cleanup = () => {
    const set = copilotWsMap.get(agentId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      copilotWsMap.delete(agentId);
    }
  };

  ws.on("message", async (msg) => {
    try {
      const parsed = JSON.parse(msg.toString());
      if (parsed.type === "send" && typeof parsed.prompt === "string") {
        await entry.session.send({ prompt: parsed.prompt });
      } else if (parsed.type === "abort") {
        await entry.session.abort();
      }
    } catch (err) {
      console.error(`[Tiger] Copilot WS message failed for ${agentId}:`, err);
    }
  });

  ws.on("close", cleanup);
  ws.on("error", (err) => {
    console.error("WebSocket error:", err);
    cleanup();
  });
}

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
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
          if (ptyProc) {
            ptyProc.kill();
            ptyMap.delete(agentId);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/_tiger/spawn-copilot-sdk") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { agentId, projectId, repoPath, initialPrompt, model } = JSON.parse(body);
          await spawnCopilotSdk(agentId, projectId, repoPath, initialPrompt, model);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }

    if (req.method === "POST" && req.url === "/_tiger/kill-copilot-sdk") {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", async () => {
        try {
          const { agentId } = JSON.parse(body);
          await disconnectCopilotSession(agentId);
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
    if (req.url?.startsWith("/ws/terminal/")) {
      handleTerminalConnection(ws, req);
      return;
    }

    if (req.url?.startsWith("/ws/copilot/")) {
      handleCopilotConnection(ws, req).catch((err) => {
        console.error("WebSocket error:", err);
        sendJson(ws, { type: "not_found" });
        ws.close();
      });
    }
  });

  const nextUpgradeHandler = app.getUpgradeHandler?.();

  server.on("upgrade", (req, socket, head) => {
    if (req.url && (req.url.startsWith("/ws/terminal/") || req.url.startsWith("/ws/copilot/"))) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
    } else if (nextUpgradeHandler) {
      nextUpgradeHandler(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Tiger ready on http://${hostname}:${port}`);
    restoreAgents().catch((err) => console.error("[Tiger] restoreAgents failed:", err));
  });
});

// Re-spawn PTYs for agents that were running when the server last shut down.
// Called after the server starts listening so Tiger's own APIs are available to restored agents.
async function restoreAgents() {
  if (!fs.existsSync(AGENTS_DIR)) return;

  const dataFile = path.join(os.homedir(), ".tiger", "data.json");
  let projects = [];
  try {
    projects = JSON.parse(fs.readFileSync(dataFile, "utf-8")).projects || [];
  } catch {
    return;
  }
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  let files = [];
  try {
    files = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }

  const tasks = [];

  for (const file of files) {
    let records = [];
    try {
      records = JSON.parse(fs.readFileSync(path.join(AGENTS_DIR, file), "utf-8"));
    } catch {
      continue;
    }

    for (const agent of records.filter((r) => r.status === "running")) {
      const project = projectMap.get(agent.projectId);
      if (!project || !fs.existsSync(project.repoPath)) {
        tasks.push(
          notifyAgentUpdate(agent.projectId, agent.id, { status: "killed", completedAt: new Date().toISOString() }) ||
          updateAgentOnDisk(agent.id, agent.projectId, { status: "killed", completedAt: new Date().toISOString() })
        );
        continue;
      }

      if (agent.agentType === "copilot") {
        try {
          await spawnCopilotSdk(agent.id, agent.projectId, project.repoPath, null, null);
          notifyAgentUpdate(agent.projectId, agent.id, { status: "running", pid: null });
          updateAgentOnDisk(agent.id, agent.projectId, { status: "running", pid: null });
          console.log(`[Tiger] Restored SDK copilot session ${agent.id} (${agent.label})`);
        } catch (err) {
          const update = { status: "killed", completedAt: new Date().toISOString(), pid: null };
          tasks.push(
            notifyAgentUpdate(agent.projectId, agent.id, update) ||
            updateAgentOnDisk(agent.id, agent.projectId, update)
          );
          console.error(`[Tiger] Failed to restore SDK copilot session ${agent.id}:`, err);
        }
        continue;
      }

      try {
        const command = agent.agentType === "terminal" ? undefined : agent.command;
        const args = agent.agentType === "terminal" ? undefined : agent.flags;
        const newPid = spawnPty(agent.id, project.repoPath, command, args, null, agent.projectId);
        const chunks = scrollbackMap.get(agent.id);
        if (chunks) chunks.unshift(Buffer.from("\r\n\x1b[2;33m[Tiger] Session restored after restart\x1b[0m\r\n\r\n", "binary"));
        notifyAgentUpdate(agent.projectId, agent.id, { status: "running", pid: newPid });
        updateAgentOnDisk(agent.id, agent.projectId, { pid: newPid, status: "running" });
        console.log(`[Tiger] Restored agent ${agent.id} (${agent.label})`);
      } catch (err) {
        tasks.push(
          notifyAgentUpdate(agent.projectId, agent.id, { status: "killed", completedAt: new Date().toISOString() }) ||
          updateAgentOnDisk(agent.id, agent.projectId, { status: "killed", completedAt: new Date().toISOString() })
        );
        console.error(`[Tiger] Failed to restore agent ${agent.id}:`, err);
      }
    }
  }

  await Promise.allSettled(tasks.filter(Boolean));
}
