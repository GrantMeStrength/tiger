import { spawn, ChildProcess } from "child_process";
import type { AgentRecord, AgentType } from "@/types";
import { getPersistedAgents, savePersistedAgents, getAllPersistedAgents } from "@/lib/data";

interface AgentEntry {
  record: AgentRecord;
  process: ChildProcess | null;
  output: string[];
}

// Survive Next.js hot-reloads with global singletons
declare global {
  // eslint-disable-next-line no-var
  var __tigerAgents: Map<string, AgentEntry> | undefined;
}

function registry(): Map<string, AgentEntry> {
  if (!global.__tigerAgents) {
    global.__tigerAgents = new Map();
    // Load persisted agent records from disk on first access
    try {
      for (const record of getAllPersistedAgents()) {
        global.__tigerAgents.set(record.id, { record, process: null, output: [] });
      }
    } catch { /* ignore — disk unavailable */ }
  }
  return global.__tigerAgents;
}

function persistProjectAgents(projectId: string): void {
  const records = Array.from(registry().values())
    .map((e) => e.record)
    .filter((r) => r.projectId === projectId);
  try { savePersistedAgents(projectId, records); } catch { /* ignore */ }
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

// Register a terminal agent record — PTY is spawned by server.js via /_tiger/spawn-pty
export function registerTerminalAgent(params: {
  id: string;
  projectId: string;
  agentType: AgentType;
  label: string;
  task: string;
  command: string;
  flags: string[];
  repoPath: string;
  pid: number | null;
  status: "running" | "failed";
  errorMessage?: string;
}): AgentRecord {
  const record: AgentRecord = {
    id: params.id,
    projectId: params.projectId,
    agentType: params.agentType,
    label: params.label,
    task: params.task,
    command: params.command,
    flags: params.flags,
    status: params.status,
    pid: params.pid,
    startedAt: new Date().toISOString(),
    completedAt: params.status === "failed" ? new Date().toISOString() : null,
    exitCode: null,
  };
  const output: string[] = [];
  if (params.errorMessage) output.push(`Error: ${params.errorMessage}`);
  registry().set(params.id, { record, process: null, output });
  persistProjectAgents(params.projectId);
  return record;
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

  const addOutput = (line: string) => {
    entry.output.push(line);
    if (entry.output.length > 10000) entry.output.shift();
  };

  const parts = params.command.trim().split(/\s+/);
  const args = [...parts.slice(1), ...params.flags];

  addOutput(`$ ${parts[0]} ${args.join(" ")}`);
  addOutput(`Working directory: ${params.repoPath}`);
  addOutput("─".repeat(60));

  try {
    const proc = spawn(parts[0], args, {
      cwd: params.repoPath,
      env: { ...process.env },
      shell: true,
      stdio: ["pipe", "pipe", "pipe"],
    });

    entry.process = proc;
    record.pid = proc.pid ?? null;

    // Send task as stdin input (interactive CLIs like copilot read from stdin)
    if (params.task.trim()) {
      proc.stdin?.write(params.task.trim() + "\n");
    }

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
    addOutput(`Failed to spawn: ${err instanceof Error ? err.message : String(err)}`);
  }

  return record;
}

export function killAgent(id: string): boolean {
  const entry = registry().get(id);
  if (!entry || entry.record.status !== "running") return false;

  // Terminal PTY kill is handled by the API route calling /_tiger/kill-pty
  // For process agents, kill directly
  if (entry.record.agentType !== "terminal") {
    entry.process?.kill("SIGTERM");
  }

  entry.record.status = "killed";
  entry.record.completedAt = new Date().toISOString();
  entry.output.push("─".repeat(60));
  entry.output.push("⊘ Agent killed");
  persistProjectAgents(entry.record.projectId);
  return true;
}

export function removeAgent(id: string): void {
  const entry = registry().get(id);
  const projectId = entry?.record.projectId;
  registry().delete(id);
  if (projectId) persistProjectAgents(projectId);
}

export function renameAgent(id: string, label: string): AgentRecord | undefined {
  const entry = registry().get(id);
  if (!entry) return undefined;
  entry.record.label = label;
  persistProjectAgents(entry.record.projectId);
  return entry.record;
}

// Update lifecycle fields (status, exitCode, completedAt, pid) — called by server.js via API
// when a PTY exits. If expectedPid is provided, the update is skipped when the agent's
// current pid no longer matches (e.g. the agent was relaunched before the old PTY's exit fired).
export function updateAgentRecord(
  id: string,
  updates: Partial<Pick<AgentRecord, "status" | "exitCode" | "completedAt" | "pid">>,
  expectedPid?: number | null
): AgentRecord | undefined {
  const entry = registry().get(id);
  if (!entry) return undefined;
  if (expectedPid !== undefined && entry.record.pid !== expectedPid) return entry.record;
  Object.assign(entry.record, updates);
  persistProjectAgents(entry.record.projectId);
  return entry.record;
}
