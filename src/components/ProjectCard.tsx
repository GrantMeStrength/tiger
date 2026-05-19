"use client";

import type { Project } from "@/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Props {
  project: Project;
  agentCounts: { running: number; completed: number; failed: number; killed: number; total: number };
  onDelete: (id: string) => void;
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
      {/* Running dot — top right */}
      {hasRunning && (
        <div style={{
          position: "absolute", top: 18, right: 18,
          width: 7, height: 7, borderRadius: "50%",
          background: "var(--color-accent)",
        }} />
      )}

      {/* Delete — fades in on hover */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete "${project.name}"?`)) onDelete(project.id);
        }}
        style={{
          position: "absolute", top: hasRunning ? 32 : 14, right: 14,
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
      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text)", marginBottom: 5, letterSpacing: "-0.02em", paddingRight: 20 }}>
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

      {/* Status chips */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {agentCounts.running > 0 && (
          <span style={{ fontSize: 11, color: "var(--color-accent)", fontWeight: 500 }}>
            {agentCounts.running} running
          </span>
        )}
        {agentCounts.completed > 0 && (
          <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{agentCounts.completed} done</span>
        )}
        {agentCounts.failed > 0 && (
          <span style={{ fontSize: 11, color: "var(--color-error)" }}>{agentCounts.failed} failed</span>
        )}
        {agentCounts.total === 0 && (
          <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>No sessions</span>
        )}
      </div>
    </div>
  );
}

