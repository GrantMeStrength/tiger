export type AgentType = "copilot" | "terminal";

export type TaskStatus = "todo" | "in-progress" | "done" | "blocked";

export interface Project {
  id: string;
  name: string;
  repoPath: string;
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

export interface AppData {
  settings: Settings;
  projects: Project[];
}
