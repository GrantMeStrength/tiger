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

export interface Settings {
  defaultCommand: string;
  defaultFlags: string[];
}

export interface AppData {
  settings: Settings;
  projects: Project[];
}
