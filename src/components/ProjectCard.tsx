"use client";

import type { Project } from "@/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  project: Project;
  agentCounts: { running: number; completed: number; failed: number; killed: number; total: number };
  onDelete: (id: string) => void;
}

function AgentSparkline({ counts }: { counts: Props["agentCounts"] }) {
  const { running, completed, failed, killed, total } = counts;
  if (total === 0) return <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>No sessions</span>;

  const W = 120, H = 10, gap = 2;
  const segs = [
    { n: running,   color: "var(--color-running)" },
    { n: completed, color: "var(--color-success)"  },
    { n: failed,    color: "var(--color-error)"    },
    { n: killed,    color: "var(--color-text-faint)" },
  ].filter((s) => s.n > 0);

  let x = 0;
  const usableW = W - gap * (segs.length - 1);
  const rects = segs.map((s) => {
    const w = Math.round((s.n / total) * usableW);
    const r = { x, w, color: s.color };
    x += w + gap;
    return r;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width={W} height={H} style={{ borderRadius: 3, overflow: "visible" }}>
        {rects.map((r, i) => (
          <rect key={i} x={r.x} y={0} width={r.w} height={H} rx={2} fill={r.color} />
        ))}
      </svg>
      <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
        {total} session{total !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

export function ProjectCard({ project, agentCounts, onDelete }: Props) {
  const router = useRouter();
  const hasRunning = agentCounts.running > 0;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="animate-in"
      style={{
        background: hovered ? "var(--color-surface-raised)" : "var(--color-surface)",
        border: `1px solid ${hovered ? "var(--color-border)" : "var(--color-border-subtle)"}`,
        borderRadius: 8,
        padding: "20px 22px",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.1s, border-color 0.1s",
      }}
      onClick={() => router.push(`/projects/${project.id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Animated running pulse — top right */}
      {hasRunning && (
        <div style={{ position: "absolute", top: 18, right: 18, display: "flex", alignItems: "center", gap: 5 }}>
          <span className="status-pulse" />
          <span style={{ fontSize: 10, color: "var(--color-running)", fontWeight: 500, letterSpacing: "0.04em" }}>
            {agentCounts.running} running
          </span>
        </div>
      )}

      {/* Delete — fades in on hover */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${project.name}"?`)) onDelete(project.id);
        }}
        style={{
          position: "absolute", top: hasRunning ? 36 : 14, right: 14,
          background: "none", border: "none", cursor: "pointer",
          color: "var(--color-text-faint)", fontSize: 16, padding: "2px 4px",
          opacity: hovered ? 1 : 0, transition: "opacity 0.1s, color 0.1s",
          lineHeight: 1,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
        title="Delete project"
      >
        ×
      </button>

      {/* Project name */}
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)", marginBottom: 5, letterSpacing: "-0.02em", paddingRight: hasRunning ? 110 : 20 }}>
        {project.name}
      </div>

      {/* Repo path */}
      <div style={{ fontSize: 11, color: "var(--color-text-faint)", fontFamily: "var(--font-mono)", marginBottom: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {project.repoPath}
      </div>

      {project.description && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 14, lineHeight: 1.6 }}>
          {project.description}
        </div>
      )}

      <AgentSparkline counts={agentCounts} />
    </div>
  );
}

