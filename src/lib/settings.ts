import fs from "fs";
import path from "path";
import os from "os";

export interface TigerSettings {
  githubToken: string;
  aiKey: string;
  aiBaseUrl: string;
  defaultCommand: string;
  defaultFlags: string;  // space-separated string for easy editing
}

export const SETTINGS_DEFAULTS: TigerSettings = {
  githubToken: "",
  aiKey: "",
  aiBaseUrl: "https://models.inference.ai.azure.com",
  defaultCommand: "gh copilot code",
  defaultFlags: "--yolo --resume",
};

export const SETTINGS_KEYS = Object.keys(SETTINGS_DEFAULTS) as (keyof TigerSettings)[];

const SETTINGS_PATH = path.join(os.homedir(), ".tiger", "settings.json");

let _cache: TigerSettings | null = null;
let _cacheTime = 0;
const CACHE_TTL = 2000;

function sanitize(raw: unknown): TigerSettings {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  const result: Partial<TigerSettings> = {};
  for (const key of SETTINGS_KEYS) {
    result[key] = String(obj[key] ?? SETTINGS_DEFAULTS[key]);
  }
  return result as TigerSettings;
}

export function loadSettings(): TigerSettings {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    _cache = sanitize(JSON.parse(raw));
    _cacheTime = now;
    return _cache;
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function saveSettings(settings: TigerSettings): void {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
  _cache = settings;
  _cacheTime = Date.now();
  applySettingsToEnv(settings);
}

export function applySettingsToEnv(settings: TigerSettings): void {
  if (settings.githubToken) process.env.GITHUB_TOKEN = settings.githubToken;
  if (settings.aiKey) process.env.OPENAI_API_KEY = settings.aiKey;
  if (settings.aiBaseUrl) process.env.OPENAI_BASE_URL = settings.aiBaseUrl;
}

/** Returns true if required settings are present */
export function isConfigured(): boolean {
  const s = loadSettings();
  return !!s.defaultCommand;
}
