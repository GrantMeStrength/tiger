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
        border: `1px solid ${hasRunning ? "var(--color-running)" : "var(--color-border)"}`,
        borderRadius: "10px",
        padding: "18px 20px",
        cursor: "pointer",
        transition: "border-color 0.15s, box-shadow 0.15s",
        position: "relative",
      }}
      onClick={() => router.push(`/projects/${project.id}`)}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 0 1px var(--color-accent)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      {/* Running indicator */}
      {hasRunning && (
        <span
          className="pulse-dot"
          style={{
            position: "absolute",
            top: "16px",
            right: "16px",
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: "var(--color-running)",
            display: "block",
          }}
        />
      )}

      <div style={{ marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ fontSize: "16px" }}>📁</span>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
          {project.name}
        </span>
      </div>

      <div
        style={{
          fontSize: "11px",
          color: "var(--color-text-faint)",
          fontFamily: "var(--font-mono)",
          marginBottom: "14px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {project.repoPath}
      </div>

      {project.description && (
        <div
          style={{
            fontSize: "12px",
            color: "var(--color-text-muted)",
            marginBottom: "14px",
            lineHeight: 1.4,
          }}
        >
          {project.description}
        </div>
      )}

      {/* Agent counts */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        {agentCounts.running > 0 && (
          <Chip label={`${agentCounts.running} running`} color="var(--color-running)" />
        )}
        {agentCounts.completed > 0 && (
          <Chip label={`${agentCounts.completed} done`} color="var(--color-success)" />
        )}
        {agentCounts.failed > 0 && (
          <Chip label={`${agentCounts.failed} failed`} color="var(--color-error)" />
        )}
        {agentCounts.total === 0 && (
          <Chip label="no agents" color="var(--color-text-faint)" />
        )}
      </div>

      {/* Default command */}
      <div
        style={{
          marginTop: "12px",
          fontSize: "11px",
          color: "var(--color-text-faint)",
          fontFamily: "var(--font-mono)",
        }}
      >
        {project.defaultCommand} {project.defaultFlags.join(" ")}
      </div>

      {/* Delete button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (confirm(`Delete project "${project.name}"?`)) onDelete(project.id);
        }}
        style={{
          position: "absolute",
          bottom: "14px",
          right: "14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-text-faint)",
          fontSize: "14px",
          padding: "2px 4px",
          borderRadius: "4px",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--color-error)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)";
        }}
        title="Delete project"
      >
        ✕
      </button>
    </div>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span
      style={{
        fontSize: "11px",
        color,
        background: `${color}1a`,
        border: `1px solid ${color}44`,
        borderRadius: "12px",
        padding: "2px 8px",
      }}
    >
      {label}
    </span>
  );
}
