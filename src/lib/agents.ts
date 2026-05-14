import { spawn, ChildProcess } from "child_process";
import type { AgentRecord, AgentType } from "@/types";

// node-pty is a native module — import conditionally to avoid SSR issues
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pty = require("node-pty");

interface AgentEntry {
  record: AgentRecord;
  process: ChildProcess | null;
  output: string[];
}

// Survive Next.js hot-reloads with global singletons
declare global {
  // eslint-disable-next-line no-var
  var __tigerAgents: Map<string, AgentEntry> | undefined;
  // eslint-disable-next-line no-var
  var __tigerPtys: Map<string, unknown> | undefined;
}

function registry(): Map<string, AgentEntry> {
  if (!global.__tigerAgents) {
    global.__tigerAgents = new Map();
  }
  return global.__tigerAgents;
}

function ptyRegistry(): Map<string, unknown> {
  if (!global.__tigerPtys) {
    global.__tigerPtys = new Map();
  }
  return global.__tigerPtys;
}

export function getAgents(projectId?: string): AgentRecord[] {
  const all = Array.from(registry().values()).map((e) => e.record);
  return projectId ? all.filter((a) => a.projectId === projectId) : all;
}

export function getAgent(id: string): AgentRecord | undefined {
  return registry().get(id)?.record;
}

export function getAgentOutput(id: string): string[] {
  return registry().get(id)?.output ?? [];
}

export function launchAgent(params: {
  id: string;
  projectId: string;
  agentType: AgentType;
  label: string;
  task: string;
  command: string;
  flags: string[];
  repoPath: string;
}): AgentRecord {
  const record: AgentRecord = {
    id: params.id,
    projectId: params.projectId,
    agentType: params.agentType,
    label: params.label,
    task: params.task,
    command: params.command,
    flags: params.flags,
    status: "running",
    pid: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    exitCode: null,
  };

  const entry: AgentEntry = { record, process: null, output: [] };
  registry().set(params.id, entry);

  const addLine = (line: string) => {
    entry.output.push(line);
    if (entry.output.length > 10000) entry.output.shift();
  };

  if (params.agentType === "terminal") {
    // Spawn a PTY bash session in the project directory
    try {
      const ptyProcess = pty.spawn("bash", [], {
        name: "xterm-256color",
        cols: 120,
        rows: 40,
        cwd: params.repoPath,
        env: { ...process.env, TERM: "xterm-256color" },
      });
      record.pid = ptyProcess.pid;
      ptyRegistry().set(params.id, ptyProcess);

      ptyProcess.onData((data: string) => {
        data.split("\n").forEach((line: string) => { if (line.trim()) addLine(line); });
      });

      ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
        const e = registry().get(params.id);
        if (!e) return;
        e.record.status = exitCode === 0 ? "completed" : "killed";
        e.record.completedAt = new Date().toISOString();
        e.record.exitCode = exitCode;
        ptyRegistry().delete(params.id);
      });
    } catch (err) {
      record.status = "failed";
      record.completedAt = new Date().toISOString();
      addLine(`Failed to spawn PTY: ${err instanceof Error ? err.message : String(err)}`);
    }
    return record;
  }

  // ── Copilot / process agent ─────────────────────────────────────────────
  const addOutput = (line: string) => {
    entry.output.push(line);
    if (entry.output.length > 10000) entry.output.shift();
  };

  const parts = params.command.trim().split(/\s+/);
  const args = [...parts.slice(1), ...params.flags];
  if (params.task.trim()) args.push(params.task.trim());

  addOutput(`$ ${parts[0]} ${args.join(" ")}`);
  addOutput(`Working directory: ${params.repoPath}`);
  addOutput("─".repeat(60));

  try {
    const proc = spawn(parts[0], args, {
      cwd: params.repoPath,
      env: { ...process.env },
      shell: false,
    });

    entry.process = proc;
    record.pid = proc.pid ?? null;

    proc.stdout?.on("data", (data: Buffer) => {
      data.toString().split("\n").forEach((line) => { if (line) addOutput(line); });
    });

    proc.stderr?.on("data", (data: Buffer) => {
      data.toString().split("\n").forEach((line) => { if (line) addOutput(line); });
    });

    proc.on("close", (code: number | null) => {
      const e = registry().get(params.id);
      if (!e) return;
      e.record.status = code === 0 ? "completed" : "failed";
      e.record.completedAt = new Date().toISOString();
      e.record.exitCode = code;
      addOutput("─".repeat(60));
      addOutput(code === 0 ? "✓ Agent completed successfully" : `✗ Agent exited with code ${code}`);
    });

    proc.on("error", (err: Error) => {
      const e = registry().get(params.id);
      if (!e) return;
      e.record.status = "failed";
      e.record.completedAt = new Date().toISOString();
      addOutput(`Error: ${err.message}`);
    });
  } catch (err) {
    record.status = "failed";
    record.completedAt = new Date().toISOString();
    addLine(`Failed to spawn: ${err instanceof Error ? err.message : String(err)}`);
  }

  return record;
}

export function killAgent(id: string): boolean {
  const entry = registry().get(id);
  if (!entry || entry.record.status !== "running") return false;

  const ptyProc = ptyRegistry().get(id);
  if (ptyProc) {
    (ptyProc as { kill: () => void }).kill();
    ptyRegistry().delete(id);
  } else {
    entry.process?.kill("SIGTERM");
  }

  entry.record.status = "killed";
  entry.record.completedAt = new Date().toISOString();
  entry.output.push("─".repeat(60));
  entry.output.push("⊘ Agent killed");
  return true;
}

export function removeAgent(id: string): void {
  registry().delete(id);
  ptyRegistry().delete(id);
}
