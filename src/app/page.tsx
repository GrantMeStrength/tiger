"use client";

import { useState, useEffect, useCallback } from "react";
import type { Project, AgentRecord } from "@/types";
import { ProjectCard } from "@/components/ProjectCard";
import { AddProjectModal } from "@/components/AddProjectModal";
import { SettingsPanel } from "@/components/SettingsPanel";

interface AgentCounts {
  running: number; completed: number; failed: number; killed: number; total: number;
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [defaultCommand, setDefaultCommand] = useState("gh copilot code");
  const [defaultFlags, setDefaultFlags] = useState(["--yolo", "--resume"]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    const [projRes, settingsRes] = await Promise.all([
      fetch("/api/projects"),
      fetch("/api/settings"),
    ]);
    const projs = await projRes.json();
    const s = await settingsRes.json();
    setProjects(projs);
    setDefaultCommand(s.defaultCommand || "gh copilot code");
    setDefaultFlags((s.defaultFlags || "--yolo --resume").split(/\s+/).filter(Boolean));
    // Show first-run settings if no GitHub token or AI key configured
    if (!s.defaultCommand) setIsFirstRun(true);
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
      {/* Header — clean, no decoration */}
      <header
        style={{
          borderBottom: "1px solid var(--color-border-subtle)",
          padding: "0 40px",
          height: "52px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          background: "var(--color-bg)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
          <span style={{ fontSize: "14px", fontWeight: 500, letterSpacing: "-0.01em", color: "var(--color-text)" }}>
            Tiger
          </span>
          {totalRunning > 0 && (
            <span style={{ fontSize: "11px", color: "var(--color-running)", fontWeight: 400 }}>
              {totalRunning} running
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button
            onClick={() => setShowSettings(true)}
            style={{
              padding: "6px 12px",
              background: "none",
              border: "none",
              color: "var(--color-text-faint)",
              fontSize: "12px",
              cursor: "pointer",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
          >
            Settings
          </button>
          <button
            onClick={() => setShowAddProject(true)}
            style={{
              padding: "6px 14px",
              background: "none",
              border: "1px solid var(--color-border)",
              color: "var(--color-text-muted)",
              fontSize: "12px",
              fontWeight: 500,
              cursor: "pointer",
              letterSpacing: "0.01em",
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = "var(--color-accent)";
              b.style.color = "var(--color-accent)";
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = "var(--color-border)";
              b.style.color = "var(--color-text-muted)";
            }}
          >
            New Project
          </button>
        </div>
      </header>

      {/* Main content */}
      <main style={{ padding: "48px 40px", maxWidth: "1200px", margin: "0 auto" }}>
        {loading ? (
          <div style={{ color: "var(--color-text-faint)", fontSize: "12px", padding: "80px 0", textAlign: "center" }}>
            —
          </div>
        ) : projects.length === 0 ? (
          <div style={{ padding: "120px 0", textAlign: "center" }}>
            <div style={{ fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)", marginBottom: "8px", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              No projects
            </div>
            <div style={{ fontSize: "12px", color: "var(--color-text-faint)", marginBottom: "32px", lineHeight: 1.8 }}>
              Add a project to begin managing agent sessions
            </div>
            <button
              onClick={() => setShowAddProject(true)}
              style={{
                padding: "9px 20px",
                background: "var(--color-accent)",
                border: "none",
                color: "white",
                fontSize: "12px",
                fontWeight: 500,
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              Add project
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
              gap: "1px",
              background: "var(--color-border-subtle)",
              border: "1px solid var(--color-border-subtle)",
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

      {showAddProject && (
        <AddProjectModal
          defaultCommand={defaultCommand}
          defaultFlags={defaultFlags}
          onAdd={handleAdd}
          onClose={() => setShowAddProject(false)}
        />
      )}

      {(showSettings || isFirstRun) && (
        <SettingsPanel
          isFirstRun={isFirstRun}
          onClose={() => { setShowSettings(false); setIsFirstRun(false); }}
        />
      )}
    </div>
  );
}
