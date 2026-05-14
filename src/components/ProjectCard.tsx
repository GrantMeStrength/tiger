"use client";

import type { Project } from "@/types";
import { useRouter } from "next/navigation";

interface Props {
  project: Project;
  agentCounts: { running: number; completed: number; failed: number; killed: number; total: number };
  onDelete: (id: string) => void;
}

export function ProjectCard({ project, agentCounts, onDelete }: Props) {
  const router = useRouter();
  const hasRunning = agentCounts.running > 0;

  return (
    <div
      className="animate-in"
      style={{
        background: "var(--color-surface)",
        padding: "28px 32px",
        cursor: "pointer",
        position: "relative",
        borderLeft: hasRunning ? `2px solid var(--color-running)` : "2px solid transparent",
        transition: "background 0.1s",
      }}
      onClick={() => router.push(`/projects/${project.id}`)}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--color-surface-raised)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = "var(--color-surface)"; }}
    >
      {/* Project name */}
      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text)", marginBottom: "6px", letterSpacing: "-0.005em" }}>
        {project.name}
      </div>

      {/* Repo path */}
      <div style={{ fontSize: "11px", color: "var(--color-text-faint)", fontFamily: "var(--font-mono)", marginBottom: "16px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {project.repoPath}
      </div>

      {project.description && (
        <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "16px", lineHeight: 1.6 }}>
          {project.description}
        </div>
      )}

      {/* Status line */}
      <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
        {agentCounts.running > 0 && (
          <span style={{ fontSize: "11px", color: "var(--color-running)" }}>
            {agentCounts.running} running
          </span>
        )}
        {agentCounts.completed > 0 && (
          <span style={{ fontSize: "11px", color: "var(--color-text-faint)" }}>
            {agentCounts.completed} done
          </span>
        )}
        {agentCounts.failed > 0 && (
          <span style={{ fontSize: "11px", color: "var(--color-error)" }}>
            {agentCounts.failed} failed
          </span>
        )}
        {agentCounts.total === 0 && (
          <span style={{ fontSize: "11px", color: "var(--color-text-faint)" }}>no sessions</span>
        )}
      </div>

      {/* Delete — visible on hover only */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${project.name}"?`)) onDelete(project.id);
        }}
        style={{
          position: "absolute",
          top: "20px",
          right: "20px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-faint)",
          fontSize: "11px",
          padding: "4px",
          opacity: 0,
          transition: "opacity 0.1s, color 0.1s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
        ref={(el) => {
          if (!el) return;
          const parent = el.closest("[data-card]") ?? el.parentElement;
          parent?.addEventListener("mouseenter", () => { el.style.opacity = "1"; });
          parent?.addEventListener("mouseleave", () => { el.style.opacity = "0"; });
        }}
        title="Delete project"
      >
        ×
      </button>
    </div>
  );
}


interface Props {
  project: Project;
  agentCounts: { running: number; completed: number; failed: number; killed: number; total: number };
  onDelete: (id: string) => void;
}
