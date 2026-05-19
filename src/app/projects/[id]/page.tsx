"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { Project, AgentRecord, AgentType } from "@/types";
import { AgentCard } from "@/components/AgentCard";
import { LaunchAgentModal } from "@/components/LaunchAgentModal";
import PlannerPanel from "@/components/PlannerPanel";
import GitPanel from "@/components/GitPanel";
import ContextPanel from "@/components/ContextPanel";
import MemoryPanel from "@/components/MemoryPanel";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

// xterm.js must not render on server
const TerminalAgentView = dynamic(() => import("@/components/TerminalAgentView"), { ssr: false });

type ActiveView = "session" | "context" | "plan" | "git" | "memory";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("session");
  const [output, setOutput] = useState<string[]>([]);
  const [showLaunch, setShowLaunch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const outputRef = useRef<HTMLDivElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  // Fetch project + agents
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
    fetchData();
  }, [fetchData]);

  // Fetch all projects for the horizontal strip
  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then(setAllProjects).catch(() => {});
    const t = setInterval(() => {
      fetch("/api/projects").then((r) => r.json()).then(setAllProjects).catch(() => {});
    }, 10_000);
    return () => clearInterval(t);
  }, []);

  // Poll output — only for copilot agents
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (!selectedAgentId || selectedAgent?.agentType === "terminal") return;

    let lineCount = 0;
    let aborted = false;

    const poll = async () => {
      if (aborted) return;
      const res = await fetch(`/api/projects/${id}/agents/${selectedAgentId}/output?since=${lineCount}`);
      if (aborted) return;
      if (!res.ok) return;
      const data = await res.json();
      if (aborted) return;
      if (data.lines?.length > 0) {
        setOutput((prev) => [...prev, ...data.lines]);
        lineCount = data.total;
      }
      if (data.status !== "running") {
        setAgents((prev) => prev.map((a) => a.id === selectedAgentId ? { ...a, status: data.status, exitCode: data.exitCode } : a));
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    };

    setOutput([]);
    poll();
    pollingRef.current = setInterval(poll, 500);
    return () => {
      aborted = true;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, selectedAgentId, selectedAgent?.agentType]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  const handleLaunch = async (params: { label: string; task: string; command: string; flags: string[]; agentType: AgentType }) => {
    const res = await fetch(`/api/projects/${id}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const agent = await res.json();
    setAgents((prev) => [agent, ...prev]);
    setSelectedAgentId(agent.id);
    setOutput([]);
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

  if (!project) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)", background: "var(--color-bg)" }}>
        —
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg)" }}>

      {/* Header */}
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
          Tiger
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button
            onClick={() => setShowLaunch(true)}
            style={{ padding: "5px 12px", background: "var(--color-accent)", border: "none", color: "#fff", fontSize: 12, fontWeight: 500, cursor: "pointer", borderRadius: 5 }}
          >
            + Agent
          </button>
          <ThemeToggle />
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            style={{ padding: "5px 8px", background: "none", border: "none", color: "var(--color-text-faint)", fontSize: 14, cursor: "pointer", lineHeight: 1 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
          >⚙</button>
        </div>
      </header>

      {/* Horizontal project strip */}
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
              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-muted)"; }}
              onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = "var(--color-text-faint)"; }}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {/* Body: sidebar + main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", minHeight: 0 }}>

        {/* Left sidebar */}
        <div style={{
          width: 240,
          flexShrink: 0,
          borderRight: "1px solid var(--color-border-subtle)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "var(--color-surface)",
        }}>
          {/* Sessions section */}
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

          {/* Tool nav — pinned at bottom, styled to match AgentCard */}
          <div style={{ borderTop: "1px solid var(--color-border-subtle)", padding: "6px 0", flexShrink: 0 }}>
            {(["context", "plan", "git", "memory"] as const).map((view) => {
              const labels = { context: "Context", plan: "Plan", git: "Git", memory: "Memory" };
              const subtitles = { context: "Brief & conventions", plan: "Tasks & priorities", git: "Status & diff", memory: "Agent notes" };
              const icons = { context: "◈", plan: "☰", git: "⎇", memory: "◉" };
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
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "var(--color-surface-raised)"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
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

        {/* Main content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

          {/* Context panel */}
          {activeView === "context" && (
            <div style={{ flex: 1, overflow: "auto" }}>
              <ContextPanel projectId={id} />
            </div>
          )}

          {/* Plan panel */}
          {activeView === "plan" && (
            <div style={{ flex: 1, overflow: "auto" }}>
              <PlannerPanel projectId={id} />
            </div>
          )}

          {/* Git panel */}
          {activeView === "git" && (
            <div style={{ flex: 1, overflow: "auto" }}>
              <GitPanel projectId={id} />
            </div>
          )}

          {/* Memory panel */}
          {activeView === "memory" && (
            <div style={{ flex: 1, overflow: "hidden" }}>
              <MemoryPanel projectId={id} />
            </div>
          )}

          {/* Terminal sessions — always mounted to preserve terminal connections and history */}
          <div style={{ flex: 1, display: activeView === "session" ? "flex" : "none", flexDirection: "column", overflow: "hidden" }}>
            {agents.filter(a => a.agentType === "terminal" || a.agentType === "copilot").map(agent => (
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
                  <span style={{ fontSize: 11, color: agent.status === "running" ? "var(--color-running)" : "var(--color-text-faint)" }}>
                    {agent.status}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--color-text-faint)", fontFamily: "var(--font-mono)" }}>
                    {project.repoPath.split("/").pop()}
                  </span>
                </div>
                <div style={{ flex: 1, overflow: "hidden", background: "#09090b" }}>
                  <TerminalAgentView agentId={agent.id} isActive={selectedAgentId === agent.id && activeView === "session"} phosphor={agent.agentType === "terminal" ? "green" : "amber"} />
                </div>
              </div>
            ))}

            {/* Fallback empty state */}
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

      {showLaunch && (
        <LaunchAgentModal
          project={project}
          agents={agents}
          onLaunch={handleLaunch}
          onClose={() => setShowLaunch(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}
    </div>
  );
}

