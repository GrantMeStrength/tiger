"use client";

import { useState } from "react";

interface Props {
  defaultCommand: string;
  defaultFlags: string[];
  onAdd: (params: {
    name: string;
    repoPath: string;
    description: string;
    defaultCommand: string;
    defaultFlags: string[];
  }) => void;
  onClose: () => void;
}

export function AddProjectModal({ defaultCommand, defaultFlags, onAdd, onClose }: Props) {
  const [name, setName] = useState("");
  const [repoPath, setRepoPath] = useState("");
  const [description, setDescription] = useState("");
  const [command, setCommand] = useState(defaultCommand);
  const [flagsText, setFlagsText] = useState(defaultFlags.join(" "));
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !repoPath.trim()) return;
    setSaving(true);
    await onAdd({
      name: name.trim(),
      repoPath: repoPath.trim(),
      description: description.trim(),
      defaultCommand: command.trim(),
      defaultFlags: flagsText.trim() ? flagsText.trim().split(/\s+/) : [],
    });
    setSaving(false);
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
          width: "460px",
          maxWidth: "90vw",
        }}
        className="animate-in"
      >
        <h2 style={{ margin: "0 0 20px", fontSize: "15px", fontWeight: 600, color: "var(--color-text)" }}>
          Add Project
        </h2>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <Field label="Project name *">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. ADO Planner"
              style={inputStyle}
              required
            />
          </Field>

          <Field label="Repository path *" hint="Absolute path to git repo">
            <input
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
              placeholder="/Users/you/Repos/my-project"
              style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: "12px" }}
              required
            />
          </Field>

          <Field label="Description">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              style={inputStyle}
            />
          </Field>

          <Field label="Default command">
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="gh copilot code"
              style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: "12px" }}
            />
          </Field>

          <Field label="Default flags">
            <input
              value={flagsText}
              onChange={(e) => setFlagsText(e.target.value)}
              placeholder="--yolo --resume"
              style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: "12px" }}
            />
          </Field>

          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "4px" }}>
            <button type="button" onClick={onClose} style={secondaryBtn}>Cancel</button>
            <button
              type="submit"
              disabled={!name.trim() || !repoPath.trim() || saving}
              style={{
                ...primaryBtn,
                opacity: (!name.trim() || !repoPath.trim() || saving) ? 0.5 : 1,
                cursor: (!name.trim() || !repoPath.trim() || saving) ? "not-allowed" : "pointer",
              }}
            >
              {saving ? "Adding…" : "Add Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
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
