"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Project, AgentRecord, AgentType } from "@/types";
import { AgentCard } from "@/components/AgentCard";
import { LaunchAgentModal } from "@/components/LaunchAgentModal";
import { AddProjectModal } from "@/components/AddProjectModal";
import PlannerPanel from "@/components/PlannerPanel";
import GitPanel from "@/components/GitPanel";
import ContextPanel from "@/components/ContextPanel";
import MemoryPanel from "@/components/MemoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import PRPanel from "@/components/PRPanel";
import CopilotAgentView from "@/components/CopilotAgentView";

const TerminalAgentView = dynamic(() => import("@/components/TerminalAgentView"), { ssr: false });

type ActiveView = "session" | "context" | "plan" | "git" | "memory" | "pr";

interface Notification {
  id: string;
  agentLabel: string;
  exitCode: number;
  ts: number;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("session");
  const [showLaunch, setShowLaunch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notFoundAgents, setNotFoundAgents] = useState<Set<string>>(new Set());
  const [relaunchKeys, setRelaunchKeys] = useState<Record<string, number>>({});
  const notifiedAgents = useRef<Set<string>>(new Set());

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  const fetchData = useCallback(async () => {
    const [projRes, agentsRes] = await Promise.all([
      fetch(`/api/projects/${id}`),
      fetch(`/api/projects/${id}/agents`),
    ]);
    if (!projRes.ok) return;
    const proj = await projRes.json();
    const agts = await agentsRes.json();
    setProject(proj);
    setAgents(agts);
    if (agts.length > 0) {
      setSelectedAgentId((prev) => prev ?? (agts.find((a: AgentRecord) => a.status === "running")?.id ?? agts[0].id));
    }
  }, [id]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void fetchData();
    }, 0);
    return () => clearTimeout(timeout);
  }, [fetchData]);

  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then(setAllProjects).catch(() => {});
    const t = setInterval(() => {
      fetch("/api/projects").then((r) => r.json()).then(setAllProjects).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  const handleLaunch = async (params: { label: string; task: string; command: string; flags: string[]; agentType: AgentType; model?: string }) => {
    const res = await fetch(`/api/projects/${id}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const agent = await res.json();
    setAgents((prev) => [agent, ...prev]);
    setSelectedAgentId(agent.id);
    setActiveView("session");
  };

  const handleKill = async (agentId: string) => {
    await fetch(`/api/projects/${id}/agents/${agentId}`, { method: "DELETE" });
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, status: "killed" } : a));
  };

  const handleRemove = async (agentId: string) => {
    await fetch(`/api/projects/${id}/agents/${agentId}?force=true`, { method: "DELETE" });
    setAgents((prev) => prev.filter((a) => a.id !== agentId));
    if (selectedAgentId === agentId) {
      const remaining = agents.filter((a) => a.id !== agentId);
      setSelectedAgentId(remaining[0]?.id ?? null);
    }
  };

  const handleRename = async (agentId: string, label: string) => {
    await fetch(`/api/projects/${id}/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, label } : a));
  };

  const handleAgentExit = useCallback((agentId: string, exitCode: number) => {
    if (notifiedAgents.current.has(agentId)) return;
    notifiedAgents.current.add(agentId);

    const agent = agents.find((a) => a.id === agentId);
    const label = agent?.label ?? "Agent";

    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, status: "completed" as const } : a));

    const notifId = `${agentId}-${Date.now()}`;
    setNotifications((prev) => [...prev, { id: notifId, agentLabel: label, exitCode, ts: Date.now() }]);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== notifId)), 6000);

    fetch(`/api/projects/${id}/agents`).then((r) => r.json()).then(setAgents).catch(() => {});
  }, [agents, id]);

  const handleNotFound = useCallback((agentId: string) => {
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, status: "killed" as const } : a));
    setNotFoundAgents((prev) => new Set([...prev, agentId]));
  }, []);

  const handleRelaunch = useCallback(async (agentId: string) => {
    const res = await fetch(`/api/projects/${id}/agents/${agentId}/relaunch`, { method: "POST" });
    if (!res.ok) return;
    const updated = await res.json();
    setAgents((prev) => prev.map((a) => a.id === agentId ? updated : a));
    setNotFoundAgents((prev) => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
    notifiedAgents.current.delete(agentId);
    setRelaunchKeys((prev) => ({ ...prev, [agentId]: (prev[agentId] ?? 0) + 1 }));
  }, [id]);

  const handleRestartCopilot = useCallback(async (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    if (!agent || !project) return;
    setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, status: "running" as const } : a));
    try {
      const res = await fetch(`/_tiger/spawn-copilot-sdk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, projectId: id, repoPath: project.repoPath, initialPrompt: null, model: null }),
      });
      if (!res.ok) {
        setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, status: "failed" as const } : a));
      } else {
        await fetch(`/api/projects/${id}/agents/${agentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "running" }),
        });
      }
    } catch {
      setAgents((prev) => prev.map((a) => a.id === agentId ? { ...a, status: "failed" as const } : a));
    }
  }, [agents, id, project]);

  const handleAddProject = async (params: Omit<Project, "id" | "createdAt">) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const nextProject = await res.json();
    setShowAddProject(false);
    router.push(`/projects/${nextProject.id}`);
  };

  if (!project) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)", background: "var(--color-bg)" }}>
        —
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg)" }}>
      <header style={{
        borderBottom: "1px solid var(--color-border-subtle)",
        padding: "0 20px",
        height: 48,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
        gap: 16,
      }}>
        <button
          onClick={() => router.push("/")}
          style={{ background: "none", border: "none", color: "var(--color-text-faint)", fontSize: 13, fontWeight: 700, cursor: "pointer", letterSpacing: "-0.02em", padding: 0 }}
        >
          🐯 Tiger
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setShowLaunch(true)}
            style={{ padding: "5px 12px", background: "var(--color-accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 5 }}
          >
            + Session
          </button>
          <ThemeToggle />
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            style={{ padding: "5px 8px", background: "none", border: "none", color: "var(--color-text-faint)", fontSize: 14, cursor: "pointer", lineHeight: 1 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-faint)"; }}
          >⚙</button>
        </div>
      </header>

      <div style={{
        borderBottom: "1px solid var(--color-border-subtle)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "0 12px",
        height: 40,
        flexShrink: 0,
        overflowX: "auto",
        overflowY: "hidden",
        background: "var(--color-surface)",
      }}>
        {allProjects.map((p) => {
          const isActive = p.id === id;
          return (
            <button
              key={p.id}
              onClick={() => router.push(`/projects/${p.id}`)}
              style={{
                padding: "4px 12px",
                background: isActive ? "var(--color-accent)" : "none",
                border: "none",
                borderRadius: 4,
                color: isActive ? "#fff" : "var(--color-text-faint)",
                fontSize: 12,
                fontWeight: isActive ? 500 : 400,
                cursor: "pointer",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "background 0.1s, color 0.1s",
              }}
              onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "var(--color-text-muted)"; }}
              onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "var(--color-text-faint)"; }}
            >
              {p.name}
            </button>
          );
        })}
        <button
          onClick={() => setShowAddProject(true)}
          title="Add new project"
          style={{
            padding: "4px 10px",
            background: "none",
            border: "none",
            color: "var(--color-text-faint)",
            fontSize: 16,
            cursor: "pointer",
            flexShrink: 0,
            lineHeight: 1,
            marginLeft: 2,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-faint)"; }}
        >+</button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>
        <div style={{
          width: 240,
          flexShrink: 0,
          borderRight: "1px solid var(--color-border-subtle)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--color-surface)",
        }}>
          <div style={{
            padding: "10px 12px 6px",
            fontSize: 10,
            color: "var(--color-text-faint)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            flexShrink: 0,
          }}>
            Sessions {agents.length > 0 && `(${agents.length})`}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
            {agents.length === 0 ? (
              <div style={{ padding: "20px 8px", textAlign: "center", color: "var(--color-text-faint)", fontSize: 11 }}>
                No sessions yet
                <br />
                <button
                  onClick={() => setShowLaunch(true)}
                  style={{ marginTop: 10, padding: "5px 12px", background: "var(--color-accent)", border: "none", borderRadius: 5, color: "white", fontSize: 11, cursor: "pointer" }}
                >
                  Launch one
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    selected={agent.id === selectedAgentId && activeView === "session"}
                    onSelect={() => { setSelectedAgentId(agent.id); setActiveView("session"); }}
                    onKill={handleKill}
                    onRemove={handleRemove}
                    onRename={handleRename}
                  />
                ))}
              </div>
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--color-border-subtle)", padding: "6px 0", flexShrink: 0 }}>
            {(["context", "plan", "git", "memory", "pr"] as const).map((view) => {
              const labels = { context: "Context", plan: "To Do", git: "Git", memory: "Memory", pr: "PRs" };
              const subtitles = { context: "Brief & conventions", plan: "Tasks & priorities", git: "Status & diff", memory: "Agent notes", pr: "Review & approve" };
              const icons = { context: "◈", plan: "☰", git: "⎇", memory: "◉", pr: "⌥" };
              const isActive = activeView === view;
              return (
                <div
                  key={view}
                  onClick={() => setActiveView(view)}
                  style={{
                    padding: "10px 16px",
                    cursor: "pointer",
                    borderLeft: `2px solid ${isActive ? "var(--color-accent)" : "transparent"}`,
                    background: isActive ? "var(--color-surface-raised)" : "transparent",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = "var(--color-surface-raised)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, color: isActive ? "var(--color-accent)" : "var(--color-text-faint)", lineHeight: 1 }}>
                      {icons[view]}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: isActive ? 500 : 400, color: isActive ? "var(--color-text)" : "var(--color-text-muted)" }}>
                      {labels[view]}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--color-text-faint)", marginTop: 2, paddingLeft: 20 }}>
                    {subtitles[view]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
          {activeView === "context" && (
            <div style={{ flex: 1, overflow: "auto" }}>
              <ContextPanel projectId={id} />
            </div>
          )}

          {activeView === "plan" && (
            <div style={{ flex: 1, overflow: "auto" }}>
              <PlannerPanel projectId={id} />
            </div>
          )}

          {activeView === "git" && (
            <div style={{ flex: 1, overflow: "auto" }}>
              <GitPanel projectId={id} />
            </div>
          )}

          {activeView === "memory" && (
            <div style={{ flex: 1, overflow: "hidden" }}>
              <MemoryPanel projectId={id} />
            </div>
          )}

          {activeView === "pr" && (
            <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <PRPanel projectId={id} githubRepo={project.githubRepo} />
            </div>
          )}

          <div style={{ flex: 1, display: activeView === "session" ? "flex" : "none", flexDirection: "column", overflow: "hidden" }}>
            {agents.filter((agent) => agent.agentType === "terminal" || agent.agentType === "copilot").map((agent) => (
              <div
                key={agent.id}
                style={{ flex: 1, display: selectedAgentId === agent.id ? "flex" : "none", flexDirection: "column", overflow: "hidden" }}
              >
                <div style={{
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  flexShrink: 0,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text)" }}>{agent.label}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: agent.status === "running" ? "var(--color-running)" : "var(--color-text-faint)" }}>
                    {agent.status === "running" && <span className="status-pulse" />}
                    {agent.status}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-faint)", fontFamily: "var(--font-mono)" }}>
                    {project.repoPath.split("/").pop()}
                  </span>
                  <div style={{ flex: 1 }} />
                  {agent.agentType === "copilot" && agent.status !== "running" && (
                    <button
                      onClick={() => handleRestartCopilot(agent.id)}
                      title="Resume or restart this Copilot session"
                      style={{
                        background: "rgba(251,191,36,0.12)",
                        border: "1px solid rgba(251,191,36,0.35)",
                        borderRadius: 5,
                        color: "#fbbf24",
                        fontSize: 11,
                        padding: "2px 8px",
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      ↺ Restart
                    </button>
                  )}
                  {agent.agentType === "terminal" && notFoundAgents.has(agent.id) && (
                    <button
                      onClick={() => handleRelaunch(agent.id)}
                      title="Re-spawn this agent's terminal session"
                      style={{
                        background: "rgba(251,191,36,0.12)",
                        border: "1px solid rgba(251,191,36,0.35)",
                        borderRadius: 5,
                        color: "#fbbf24",
                        fontSize: 11,
                        padding: "2px 8px",
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      ↺ Relaunch
                    </button>
                  )}
                  {agent.agentType === "terminal" && (
                    <button
                      onClick={() => setShowHistory((current) => !current)}
                      title={showHistory ? "Back to terminal" : "View full session history"}
                      style={{
                        background: showHistory ? "var(--color-accent-subtle, rgba(255,255,255,0.08))" : "transparent",
                        border: `1px solid ${showHistory ? "var(--color-border)" : "var(--color-border-subtle)"}`,
                        borderRadius: 5,
                        color: "var(--color-text-faint)",
                        fontSize: 11,
                        padding: "2px 8px",
                        cursor: "pointer",
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {showHistory ? "✕ terminal" : "📜 history"}
                    </button>
                  )}
                </div>
                <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", background: agent.agentType === "terminal" ? "#09090b" : "var(--color-bg)" }}>
                  {agent.agentType === "copilot" ? (
                    <CopilotAgentView
                      agentId={agent.id}
                      isActive={selectedAgentId === agent.id && activeView === "session"}
                      onExit={handleAgentExit}
                    />
                  ) : (
                    <TerminalAgentView
                      key={`${agent.id}-${relaunchKeys[agent.id] ?? 0}`}
                      agentId={agent.id}
                      isActive={selectedAgentId === agent.id && activeView === "session"}
                      phosphor="green"
                      onExit={handleAgentExit}
                      onNotFound={handleNotFound}
                      showHistory={showHistory}
                      onHistoryToggle={setShowHistory}
                    />
                  )}
                </div>
              </div>
            ))}

            {(!selectedAgent || (selectedAgent.agentType !== "terminal" && selectedAgent.agentType !== "copilot")) && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, color: "var(--color-text-faint)" }}>
                  {selectedAgent ? "No output view for this agent type" : "Select a session"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {notifications.length > 0 && (
        <div style={{
          position: "fixed",
          top: 16,
          right: 16,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          pointerEvents: "none",
        }}>
          {notifications.map((n) => (
            <div
              key={n.id}
              style={{
                background: "var(--color-surface-raised)",
                border: `1px solid ${n.exitCode === 0 ? "#4ade80" : "#f87171"}`,
                borderRadius: 8,
                padding: "10px 14px",
                display: "flex",
                alignItems: "center",
                gap: 10,
                minWidth: 220,
                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                pointerEvents: "auto",
                animation: "toast-in 0.2s ease",
              }}
            >
              <span style={{ fontSize: 14 }}>{n.exitCode === 0 ? "✓" : "✗"}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text)" }}>{n.agentLabel}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-faint)" }}>
                  exited {n.exitCode === 0 ? "successfully" : `with code ${n.exitCode}`}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showLaunch && (
        <LaunchAgentModal
          project={project}
          agents={agents}
          onLaunch={handleLaunch}
          onClose={() => setShowLaunch(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel project={project ? { id: project.id, name: project.name, repoPath: project.repoPath } : undefined} onClose={() => setShowSettings(false)} />
      )}

      {showAddProject && (
        <AddProjectModal
          defaultCommand={project.defaultCommand ?? "gh copilot code"}
          defaultFlags={project.defaultFlags ?? []}
          onAdd={handleAddProject}
          onClose={() => setShowAddProject(false)}
        />
      )}
    </div>
  );
}
