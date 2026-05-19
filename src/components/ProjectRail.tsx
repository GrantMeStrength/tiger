"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "@/types";

interface Props {
  currentProjectId: string;
}

export function ProjectRail({ currentProjectId }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects)
      .catch(() => {});
    const t = setInterval(() => {
      fetch("/api/projects").then((r) => r.json()).then(setProjects).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  const initials = (name: string) =>
    name.replace(/[^a-zA-Z0-9 ]/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";

  return (
    <div
      style={{
        width: 52,
        flexShrink: 0,
        background: "var(--color-surface)",
        borderRight: "1px solid var(--color-border-subtle)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 0",
        gap: 6,
        overflowY: "auto",
        overflowX: "hidden",
        zIndex: 20,
      }}
    >
      {/* Home — the Tiger wordmark */}
      <button
        onClick={() => router.push("/")}
        title="All projects"
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: "transparent",
          border: "none",
          color: "var(--color-text-faint)",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          letterSpacing: "0.04em",
          flexShrink: 0,
          transition: "color 0.1s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
      >
        T
      </button>

      {/* Divider */}
      <div style={{ width: 20, height: 1, background: "var(--color-border-subtle)", flexShrink: 0, margin: "2px 0" }} />

      {/* Project buttons */}
      {projects.map((project) => {
        const isActive = project.id === currentProjectId;
        const abbr = initials(project.name);
        return (
          <button
            key={project.id}
            onClick={() => router.push(`/projects/${project.id}`)}
            title={project.name}
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: isActive ? "var(--color-accent)" : "var(--color-surface-raised)",
              border: "none",
              color: isActive ? "#fff" : "var(--color-text-muted)",
              fontSize: 10,
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              letterSpacing: "0.04em",
              flexShrink: 0,
              transition: "background 0.1s, color 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-border)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.background = "var(--color-surface-raised)";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)";
              }
            }}
          >
            {abbr}
          </button>
        );
      })}
    </div>
  );
}
