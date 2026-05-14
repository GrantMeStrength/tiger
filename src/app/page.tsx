"use client";

import { useState, useEffect, useCallback } from "react";
import type { Project, AgentRecord, Settings } from "@/types";
import { ProjectCard } from "@/components/ProjectCard";
import { AddProjectModal } from "@/components/AddProjectModal";

interface AgentCounts {
  running: number; completed: number; failed: number; killed: number; total: number;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [projRes, settingsRes] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/settings"),
    ]);
    const projs = await projRes.json();
    const s = await settingsRes.json();
    setProjects(projs);
    setSettings(s);
    setLoading(false);

    // Fetch agents for all projects
    const agentResults = await Promise.all(
      projs.map((p: Project) => fetch(`/api/projects/${p.id}/agents`).then((r) => r.json()))
    );
    setAgents(agentResults.flat());
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Poll for running agent status updates
  useEffect(() => {
    const interval = setInterval(async () => {
      const running = agents.filter((a) => a.status === "running");
      if (running.length === 0) return;
      const updates = await Promise.all(
        running.map((a) =>
          fetch(`/api/projects/${a.projectId}/agents/${a.id}`).then((r) => r.json())
        )
      );
      setAgents((prev) => {
        const map = new Map(prev.map((a) => [a.id, a]));
        updates.forEach((u: AgentRecord) => map.set(u.id, u));
        return Array.from(map.values());
      });
    }, 2000);
    return () => clearInterval(interval);
  }, [agents]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setProjects((p) => p.filter((proj) => proj.id !== id));
  };

  const handleAdd = async (params: Omit<Project, "id" | "createdAt">) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const project = await res.json();
    setProjects((p) => [...p, project]);
    setShowAddProject(false);
  };

  const countsByProject = (projectId: string): AgentCounts => {
    const projectAgents = agents.filter((a) => a.projectId === projectId);
    return {
      running: projectAgents.filter((a) => a.status === "running").length,
      completed: projectAgents.filter((a) => a.status === "completed").length,
      failed: projectAgents.filter((a) => a.status === "failed").length,
      killed: projectAgents.filter((a) => a.status === "killed").length,
      total: projectAgents.length,
    };
  };

  const totalRunning = agents.filter((a) => a.status === "running").length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--color-border-subtle)",
          padding: "14px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "var(--color-bg)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "20px" }}>🐯</span>
          <span style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text)" }}>Tiger</span>
          <span style={{ fontSize: "12px", color: "var(--color-text-faint)" }}>agent manager</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {totalRunning > 0 && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--color-running)",
                background: "rgba(88,166,255,0.1)",
                border: "1px solid rgba(88,166,255,0.3)",
                borderRadius: "12px",
                padding: "3px 10px",
                fontWeight: 600,
              }}
            >
              <span className="pulse-dot" style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: "var(--color-running)", marginRight: "6px", verticalAlign: "middle" }} />
              {totalRunning} running
            </span>
          )}
          <button
            onClick={() => setShowAddProject(true)}
            style={{
              padding: "7px 16px",
              background: "var(--color-accent)",
              border: "none",
              borderRadius: "6px",
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + Add Project
          </button>
        </div>
      </header>

      {/* Main content */}
      <main style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
        {loading ? (
          <div style={{ color: "var(--color-text-faint)", fontSize: "13px", padding: "40px", textAlign: "center" }}>
            Loading…
          </div>
        ) : projects.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "80px 40px",
              color: "var(--color-text-muted)",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🐯</div>
            <div style={{ fontSize: "18px", fontWeight: 600, marginBottom: "8px", color: "var(--color-text)" }}>
              No projects yet
            </div>
            <div style={{ fontSize: "14px", marginBottom: "24px" }}>
              Add a project to start managing your AI agent sessions
            </div>
            <button
              onClick={() => setShowAddProject(true)}
              style={{
                padding: "10px 24px",
                background: "var(--color-accent)",
                border: "none",
                borderRadius: "8px",
                color: "white",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Add your first project
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
              gap: "16px",
            }}
          >
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                agentCounts={countsByProject(project.id)}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      {showAddProject && settings && (
        <AddProjectModal
          defaultCommand={settings.defaultCommand}
          defaultFlags={settings.defaultFlags}
          onAdd={handleAdd}
          onClose={() => setShowAddProject(false)}
        />
      )}
    </div>
  );
}
