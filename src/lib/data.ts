import fs from "fs";
import path from "path";
import os from "os";
import type { AppData, Project, PlannerTask, Settings } from "@/types";

const DATA_DIR = path.join(os.homedir(), ".tiger");
const DATA_FILE = path.join(DATA_DIR, "data.json");
const PLANS_DIR = path.join(DATA_DIR, "plans");

const DEFAULT_DATA: AppData = {
  settings: {
    defaultCommand: "gh copilot code",
    defaultFlags: ["--yolo", "--resume"],
  },
  projects: [],
};

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PLANS_DIR)) {
    fs.mkdirSync(PLANS_DIR, { recursive: true });
  }
}

export function readData(): AppData {
  ensureDir();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_DATA, ...parsed };
  } catch {
    return { ...DEFAULT_DATA };
  }
}

function writeData(data: AppData) {
  ensureDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function getProjects(): Project[] {
  return readData().projects;
}

export function getProject(id: string): Project | undefined {
  return readData().projects.find((p) => p.id === id);
}

export function addProject(project: Project): void {
  const data = readData();
  data.projects.push(project);
  writeData(data);
}

export function updateProject(id: string, updates: Partial<Project>): void {
  const data = readData();
  const idx = data.projects.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error("Project not found");
  data.projects[idx] = { ...data.projects[idx], ...updates };
  writeData(data);
}

export function deleteProject(id: string): void {
  const data = readData();
  data.projects = data.projects.filter((p) => p.id !== id);
  writeData(data);
}

export function getSettings(): Settings {
  return readData().settings;
}

export function updateSettings(updates: Partial<Settings>): void {
  const data = readData();
  data.settings = { ...data.settings, ...updates };
  writeData(data);
}

// ── Planner ──────────────────────────────────────────────────────────────────

function planFile(projectId: string) {
  return path.join(PLANS_DIR, `${projectId}.json`);
}

export function getTasks(projectId: string): PlannerTask[] {
  ensureDir();
  try {
    const raw = fs.readFileSync(planFile(projectId), "utf-8");
    return JSON.parse(raw) as PlannerTask[];
  } catch {
    return [];
  }
}

function saveTasks(projectId: string, tasks: PlannerTask[]) {
  ensureDir();
  fs.writeFileSync(planFile(projectId), JSON.stringify(tasks, null, 2), "utf-8");
}

export function addTask(projectId: string, task: PlannerTask): void {
  const tasks = getTasks(projectId);
  tasks.push(task);
  saveTasks(projectId, tasks);
}

export function updateTask(projectId: string, taskId: string, updates: Partial<PlannerTask>): PlannerTask {
  const tasks = getTasks(projectId);
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx === -1) throw new Error("Task not found");
  tasks[idx] = { ...tasks[idx], ...updates, updatedAt: new Date().toISOString() };
  saveTasks(projectId, tasks);
  return tasks[idx];
}

export function deleteTask(projectId: string, taskId: string): void {
  const tasks = getTasks(projectId).filter((t) => t.id !== taskId);
  saveTasks(projectId, tasks);
}
