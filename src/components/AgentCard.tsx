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

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function AgentCard({ agent, selected, onSelect, onKill, onRemove }: Props) {
  const color = STATUS_COLOR[agent.status];
  const icon = STATUS_ICON[agent.status];
  const isRunning = agent.status === "running";

  // Live-updating elapsed timer for running agents
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
      className="animate-in"
      style={{
        padding: "12px 14px",
        borderRadius: "8px",
        cursor: "pointer",
        border: `1px solid ${selected ? "var(--color-accent)" : "var(--color-border-subtle)"}`,
        background: selected ? "var(--color-surface-raised)" : "transparent",
        transition: "all 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!selected)
          (e.currentTarget as HTMLDivElement).style.background = "var(--color-surface-raised)";
      }}
      onMouseLeave={(e) => {
        if (!selected)
          (e.currentTarget as HTMLDivElement).style.background = "transparent";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        {/* Status icon */}
        <span
          className={isRunning ? "spin" : ""}
          style={{
            color,
            fontSize: "14px",
            marginTop: "1px",
            flexShrink: 0,
            display: "inline-block",
          }}
        >
          {icon}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--color-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {agent.label}
          </div>

          {agent.task && (
            <div
              style={{
                fontSize: "11px",
                color: "var(--color-text-muted)",
                marginTop: "2px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {agent.task}
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: "8px",
              marginTop: "6px",
              alignItems: "center",
            }}
          >
            <span style={{ fontSize: "10px", color, fontWeight: 600 }}>
              {agent.status}
            </span>
            <span style={{ fontSize: "10px", color: "var(--color-text-faint)" }}>
              {elapsedStr}
            </span>
            {agent.agentType === "terminal" ? (
              <span style={{ fontSize: "9px", color: "var(--color-text-faint)", letterSpacing: "0.03em" }}>
                💻 terminal
              </span>
            ) : (
              agent.flags.length > 0 && (
                <span
                  style={{
                    fontSize: "10px",
                    color: "var(--color-text-faint)",
                    fontFamily: "var(--font-mono)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "120px",
                  }}
                >
                  {agent.flags.join(" ")}
                </span>
              )
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
          {isRunning && (
            <button
              onClick={(e) => { e.stopPropagation(); onKill(agent.id); }}
              style={actionBtn}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
              title="Kill agent"
            >
              ■
            </button>
          )}
          {!isRunning && (
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(agent.id); }}
              style={actionBtn}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
              title="Remove"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
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
