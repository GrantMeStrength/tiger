"use client";

import { useState, useEffect } from "react";
import type { AgentRecord } from "@/types";

interface Props {
  agent: AgentRecord;
  selected: boolean;
  onSelect: () => void;
  onKill: (id: string) => void;
  onRemove: (id: string) => void;
}

const STATUS_ICON: Record<AgentRecord["status"], string> = {
  running: "◌",
  completed: "✓",
  failed: "✗",
  killed: "⊘",
};

const STATUS_COLOR: Record<AgentRecord["status"], string> = {
  running: "var(--color-running)",
  completed: "var(--color-success)",
  failed: "var(--color-error)",
  killed: "var(--color-text-faint)",
};

export function AgentCard({ agent, selected, onSelect, onKill, onRemove }: Props) {
  const color = STATUS_COLOR[agent.status];
  const isRunning = agent.status === "running";

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [isRunning]);

  const elapsedMs = (agent.completedAt ? new Date(agent.completedAt).getTime() : now) - new Date(agent.startedAt).getTime();
  const elapsedStr = formatElapsed(elapsedMs);

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "14px 16px",
        cursor: "pointer",
        borderLeft: `2px solid ${selected ? "var(--color-accent)" : isRunning ? "var(--color-running)" : "transparent"}`,
        background: selected ? "var(--color-surface-raised)" : "transparent",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.background = "var(--color-surface)";
      }}
      onMouseLeave={(e) => {
        if (!selected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Label */}
          <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>
            {agent.label}
          </div>

          {/* Task preview */}
          {agent.task && (
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {agent.task}
            </div>
          )}

          {/* Status row */}
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color, letterSpacing: "0.01em" }}>
              {agent.status}
            </span>
            <span style={{ fontSize: "11px", color: "var(--color-text-faint)" }}>
              {elapsedStr}
            </span>
            {agent.agentType === "terminal" && (
              <span style={{ fontSize: "10px", color: "var(--color-text-faint)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                term
              </span>
            )}
          </div>
        </div>

        {/* Action button */}
        <div style={{ flexShrink: 0, paddingTop: "1px" }}>
          {isRunning ? (
            <button
              onClick={(e) => { e.stopPropagation(); onKill(agent.id); }}
              style={actionBtn}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
              title="Stop"
            >
              ◼
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(agent.id); }}
              style={actionBtn}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
              title="Remove"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
const actionBtn: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--color-text-faint)",
  fontSize: "12px",
  padding: "2px 4px",
  lineHeight: 1,
  borderRadius: "3px",
};
