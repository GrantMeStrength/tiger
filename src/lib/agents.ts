import { spawn, ChildProcess } from "child_process";
import type { AgentRecord } from "@/types";

interface AgentEntry {
  record: AgentRecord;
  process: ChildProcess | null;
  output: string[];
}

// Survive Next.js hot-reloads with a global singleton
declare global {
  // eslint-disable-next-line no-var
  var __tigerAgents: Map<string, AgentEntry> | undefined;
}

function registry(): Map<string, AgentEntry> {
  if (!global.__tigerAgents) {
    global.__tigerAgents = new Map();
  }
  return global.__tigerAgents;
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
  label: string;
  task: string;
  command: string;
  flags: string[];
  repoPath: string;
}): AgentRecord {
  const record: AgentRecord = {
    id: params.id,
    projectId: params.projectId,
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

  // Build command: split base command, append flags, then task if provided
  const parts = params.command.trim().split(/\s+/);
  const args = [...parts.slice(1), ...params.flags];
  if (params.task.trim()) args.push(params.task.trim());

  addLine(`$ ${parts[0]} ${args.join(" ")}`);
  addLine(`Working directory: ${params.repoPath}`);
  addLine("─".repeat(60));

  try {
    const proc = spawn(parts[0], args, {
      cwd: params.repoPath,
      env: { ...process.env },
      shell: false,
    });

    entry.process = proc;
    record.pid = proc.pid ?? null;

    proc.stdout?.on("data", (data: Buffer) => {
      data
        .toString()
        .split("\n")
        .forEach((line) => { if (line) addLine(line); });
    });

    proc.stderr?.on("data", (data: Buffer) => {
      data
        .toString()
        .split("\n")
        .forEach((line) => { if (line) addLine(line); });
    });

    proc.on("close", (code: number | null) => {
      const e = registry().get(params.id);
      if (!e) return;
      e.record.status = code === 0 ? "completed" : "failed";
      e.record.completedAt = new Date().toISOString();
      e.record.exitCode = code;
      addLine("─".repeat(60));
      addLine(
        code === 0
          ? "✓ Agent completed successfully"
          : `✗ Agent exited with code ${code}`
      );
    });

    proc.on("error", (err: Error) => {
      const e = registry().get(params.id);
      if (!e) return;
      e.record.status = "failed";
      e.record.completedAt = new Date().toISOString();
      addLine(`Error: ${err.message}`);
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
  entry.process?.kill("SIGTERM");
  entry.record.status = "killed";
  entry.record.completedAt = new Date().toISOString();
  entry.output.push("─".repeat(60));
  entry.output.push("⊘ Agent killed");
  return true;
}

export function removeAgent(id: string): void {
  registry().delete(id);
}
