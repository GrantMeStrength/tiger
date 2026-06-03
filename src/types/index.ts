export type AgentType = "copilot" | "terminal";

export type TaskStatus = "todo" | "in-progress" | "done" | "blocked";

export interface McpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface Project {
  id: string;
  name: string;
  repoPath: string;
  githubRepo?: string; // optional override: "owner/repo" — used as --repo for all gh pr commands
  description: string;
  defaultCommand: string;
  defaultFlags: string[];
  createdAt: string;
}

export interface AgentRecord {
  id: string;
  projectId: string;
  agentType: AgentType;
  label: string;
  task: string;
  command: string;
  flags: string[];
  status: "running" | "completed" | "failed" | "killed";
  pid: number | null;
  startedAt: string;
  completedAt: string | null;
  exitCode: number | null;
}

export interface PlannerTask {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: 1 | 2 | 3;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  defaultCommand: string;
  defaultFlags: string[];
}

export interface ContextSection {
  key: string;
  title: string;
  content: string;
}

export interface ContextBrief {
  sections: ContextSection[];
  updatedAt: string;
}

export interface AppData {
  settings: Settings;
  projects: Project[];
}
