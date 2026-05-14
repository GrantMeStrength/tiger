"use client";

import { useState } from "react";
import type { Project, AgentType } from "@/types";

interface Props {
  project: Project;
  onLaunch: (params: { label: string; task: string; command: string; flags: string[]; agentType: AgentType }) => void;
  onClose: () => void;
}

export function LaunchAgentModal({ project, onLaunch, onClose }: Props) {
  const [agentType, setAgentType] = useState<AgentType>("copilot");
  const [label, setLabel] = useState("");
  const [task, setTask] = useState("");
  const [command, setCommand] = useState(project.defaultCommand);
  const [flagsText, setFlagsText] = useState(project.defaultFlags.join(" "));
  const [launching, setLaunching] = useState(false);

  const isCopilot = agentType === "copilot";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setLaunching(true);
    const flags = flagsText.trim() ? flagsText.trim().split(/\s+/) : [];
    await onLaunch({ label: label.trim(), task: task.trim(), command: command.trim(), flags, agentType });
    setLaunching(false);
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "12px",
          padding: "24px",
          width: "480px",
          maxWidth: "90vw",
        }}
        className="animate-in"
      >
        <h2 style={{ margin: "0 0 18px", fontSize: "15px", fontWeight: 600, color: "var(--color-text)" }}>
          Launch Agent — {project.name}
        </h2>

        {/* Agent type toggle */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "18px" }}>
          <TypeToggle
            active={isCopilot}
            onClick={() => setAgentType("copilot")}
            icon="🤖"
            label="Copilot"
            hint="gh copilot code"
          />
          <TypeToggle
            active={!isCopilot}
            onClick={() => setAgentType("terminal")}
            icon="💻"
            label="Terminal"
            hint="Interactive bash"
          />
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Field label="Session label *" hint="A short name for this session">
            <input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={isCopilot ? "e.g. Refactor API client" : "e.g. Dev shell"}
              style={inputStyle}
              required
            />
          </Field>

          {isCopilot && (
            <>
              <Field label="Task / prompt" hint="Passed as an argument to the CLI (optional)">
                <textarea
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Describe the task for the agent..."
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", fontFamily: "var(--font-sans)" }}
                />
              </Field>

              <Field label="Command" hint="The CLI command to run">
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="gh copilot code"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: "12px" }}
                />
              </Field>

              <Field label="Flags" hint="Space-separated flags">
                <input
                  value={flagsText}
                  onChange={(e) => setFlagsText(e.target.value)}
                  placeholder="--yolo --resume"
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: "12px" }}
                />
              </Field>

              {/* Preview */}
              <div
                style={{
                  background: "var(--color-bg)",
                  border: "1px solid var(--color-border-subtle)",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  color: "var(--color-text-muted)",
                }}
              >
                <span style={{ color: "var(--color-accent)" }}>$ </span>
                {command}{flagsText ? ` ${flagsText}` : ""}
                {task ? ` "${task}"` : ""}
              </div>
            </>
          )}

          {!isCopilot && (
            <div
              style={{
                background: "var(--color-bg)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "6px",
                padding: "12px",
                fontSize: "12px",
                color: "var(--color-text-muted)",
                lineHeight: 1.6,
              }}
            >
              Opens an interactive bash session in the project directory.
              Full PTY — supports interactive commands, editors, and color output.
            </div>
          )}

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>Cancel</button>
            <button
              type="submit"
              disabled={!label.trim() || launching}
              style={{
                ...primaryBtn,
                opacity: (!label.trim() || launching) ? 0.5 : 1,
                cursor: (!label.trim() || launching) ? "not-allowed" : "pointer",
              }}
            >
              {launching ? "Launching…" : `Launch ${isCopilot ? "Copilot" : "Terminal"}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TypeToggle({
  active, onClick, icon, label, hint,
}: {
  active: boolean; onClick: () => void; icon: string; label: string; hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        padding: "10px 12px",
        background: active ? "var(--color-accent-dim)" : "var(--color-bg)",
        border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border)"}`,
        borderRadius: "8px",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.12s",
      }}
    >
      <div style={{ fontSize: "16px", marginBottom: "3px" }}>{icon}</div>
      <div style={{ fontSize: "12px", fontWeight: 600, color: active ? "var(--color-text)" : "var(--color-text-muted)" }}>
        {label}
      </div>
      <div style={{ fontSize: "10px", color: "var(--color-text-faint)" }}>{hint}</div>
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)", display: "block", marginBottom: "6px" }}>
        {label}
        {hint && <span style={{ fontWeight: 400, color: "var(--color-text-faint)", marginLeft: "6px" }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "6px",
  color: "var(--color-text)",
  fontSize: "13px",
  outline: "none",
};

const primaryBtn: React.CSSProperties = {
  padding: "8px 18px",
  background: "var(--color-accent)",
  border: "none",
  borderRadius: "6px",
  color: "white",
  fontSize: "13px",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: React.CSSProperties = {
  padding: "8px 16px",
  background: "none",
  border: "1px solid var(--color-border)",
  borderRadius: "6px",
  color: "var(--color-text-muted)",
  fontSize: "13px",
  cursor: "pointer",
};

