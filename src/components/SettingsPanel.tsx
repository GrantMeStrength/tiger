"use client";
import { useState, useEffect } from "react";

interface Settings {
  githubToken: string;
  aiKey: string;
  aiBaseUrl: string;
  defaultCommand: string;
  defaultFlags: string;
}

const DEFAULTS: Settings = {
  githubToken: "",
  aiKey: "",
  aiBaseUrl: "https://models.inference.ai.azure.com",
  defaultCommand: "gh copilot code",
  defaultFlags: "--yolo --resume",
};

interface FieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  mono?: boolean;
}

function Field({ label, hint, value, onChange, type = "text", placeholder, mono }: FieldProps) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#c9d1d9", marginBottom: 5 }}>
        {label}
      </label>
      {hint && (
        <p style={{ fontSize: 11, color: "#484f58", margin: "0 0 5px", lineHeight: 1.5 }}>{hint}</p>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          background: "#161b22", border: "1px solid #30363d",
          borderRadius: 6, color: "#c9d1d9", fontSize: 13,
          padding: "7px 10px", outline: "none",
          fontFamily: mono ? "var(--font-mono)" : "inherit",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => { e.target.style.borderColor = "#f97316"; }}
        onBlur={(e) => { e.target.style.borderColor = "#30363d"; }}
      />
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
      textTransform: "uppercase", color: "#484f58",
      margin: "20px 0 12px", paddingBottom: 6,
      borderBottom: "1px solid #21262d",
    }}>
      {children}
    </div>
  );
}

interface SettingsPanelProps {
  isFirstRun?: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isFirstRun = false, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => setSettings((prev) => ({ ...prev, ...s })))
      .catch(() => {});
  }, []);

  const set = (key: keyof Settings) => (value: string) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Save failed");
      }
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        onClose();
        window.location.reload();
      }, 1200);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#0d1117", border: "1px solid #30363d",
        borderRadius: 14, width: 520, maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #21262d", flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#c9d1d9" }}>
            {isFirstRun ? "Welcome to Tiger 🐯" : "⚙ Settings"}
          </h2>
          {isFirstRun && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8b949e", lineHeight: 1.5 }}>
              Configure your credentials and defaults. Everything is stored locally in{" "}
              <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>~/.tiger/settings.json</code>.
            </p>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "4px 24px 16px" }}>

          <SectionHeader>GitHub</SectionHeader>
          <Field
            label="GitHub Token"
            hint="Classic PAT with repo + read:org scopes — github.com/settings/tokens. Used for GitHub API access. The gh CLI uses its own auth separately."
            value={settings.githubToken}
            onChange={set("githubToken")}
            type="password"
            placeholder="ghp_..."
          />

          <SectionHeader>AI / LLM</SectionHeader>
          <Field
            label="API Key"
            hint="GitHub PAT for GitHub Models (free tier), or your Azure OpenAI key."
            value={settings.aiKey}
            onChange={set("aiKey")}
            type="password"
            placeholder="github_pat_ or Azure key"
          />
          <Field
            label="Base URL"
            hint="Leave as-is for GitHub Models. Change to your Azure OpenAI endpoint if needed."
            value={settings.aiBaseUrl}
            onChange={set("aiBaseUrl")}
            placeholder="https://models.inference.ai.azure.com"
            mono
          />

          <SectionHeader>Agent Defaults</SectionHeader>
          <Field
            label="Default Command"
            hint="The CLI command used when launching agents. Can be overridden per project and per launch."
            value={settings.defaultCommand}
            onChange={set("defaultCommand")}
            placeholder="gh copilot code"
            mono
          />
          <Field
            label="Default Flags"
            hint="Space-separated flags appended to every agent launch unless overridden."
            value={settings.defaultFlags}
            onChange={set("defaultFlags")}
            placeholder="--yolo --resume"
            mono
          />
        </div>

        {error && (
          <div style={{ padding: "0 24px 8px", color: "#f85149", fontSize: 12 }}>{error}</div>
        )}

        {/* Footer */}
        <div style={{
          padding: "14px 24px 20px", borderTop: "1px solid #21262d", flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 11, color: "#484f58" }}>
            Stored in ~/.tiger/settings.json
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {!isFirstRun && (
              <button onClick={onClose} style={{
                background: "none", border: "1px solid #30363d", borderRadius: 7,
                color: "#8b949e", cursor: "pointer", fontSize: 13, padding: "7px 16px",
              }}>
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || saved}
              style={{
                background: saved ? "#3fb950" : "#f97316",
                border: "none", borderRadius: 7, color: "#fff",
                cursor: saving || saved ? "default" : "pointer",
                fontSize: 13, fontWeight: 600, padding: "7px 20px",
                transition: "background 0.2s",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saved ? "✓ Saved" : saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
