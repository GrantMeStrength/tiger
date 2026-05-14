"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { Project, AgentRecord } from "@/types";
import { AgentCard } from "@/components/AgentCard";
import { LaunchAgentModal } from "@/components/LaunchAgentModal";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  const [outputTotal, setOutputTotal] = useState(0);
  const [showLaunch, setShowLaunch] = useState(false);
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
    // Auto-select first running agent, or first agent
    if (agts.length > 0) {
      setSelectedAgentId((prev) => prev ?? (agts.find((a: AgentRecord) => a.status === "running")?.id ?? agts[0].id));
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll output for selected agent
  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (!selectedAgentId) return;

    let lineCount = 0;

    const poll = async () => {
      const res = await fetch(`/api/projects/${id}/agents/${selectedAgentId}/output?since=${lineCount}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.lines?.length > 0) {
        setOutput((prev) => [...prev, ...data.lines]);
        lineCount = data.total;
      }
      // Update agent status
      if (data.status !== "running") {
        setAgents((prev) => prev.map((a) => a.id === selectedAgentId ? { ...a, status: data.status, exitCode: data.exitCode } : a));
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    };

    // Reset output for new selection
    setOutput([]);
    lineCount = 0;
    poll();

    pollingRef.current = setInterval(poll, 500);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [id, selectedAgentId]);

  // Auto-scroll output
  useEffect(() => {
    if (autoScroll && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  const handleLaunch = async (params: { label: string; task: string; command: string; flags: string[] }) => {
    const res = await fetch(`/api/projects/${id}/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    const agent = await res.json();
    setAgents((prev) => [agent, ...prev]);
    setSelectedAgentId(agent.id);
    setOutput([]);
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

  const copyOutput = () => {
    navigator.clipboard.writeText(output.join("\n"));
  };

  if (!project) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-faint)" }}>
        Loading…
      </div>
    );
  }

  const runningCount = agents.filter((a) => a.status === "running").length;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg)" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--color-border-subtle)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <Link href="/" style={{ color: "var(--color-text-faint)", textDecoration: "none", fontSize: "13px" }}>
            🐯 Tiger
          </Link>
          <span style={{ color: "var(--color-text-faint)" }}>/</span>
          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text)" }}>{project.name}</span>
          <span
            style={{
              fontSize: "10px",
              color: "var(--color-text-faint)",
              fontFamily: "var(--font-mono)",
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "4px",
              padding: "2px 6px",
            }}
          >
            {project.repoPath.split("/").slice(-2).join("/")}
          </span>
          {runningCount > 0 && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--color-running)",
                background: "rgba(88,166,255,0.1)",
                border: "1px solid rgba(88,166,255,0.3)",
                borderRadius: "10px",
                padding: "2px 8px",
                fontWeight: 600,
              }}
            >
              <span className="pulse-dot" style={{ display: "inline-block", width: "5px", height: "5px", borderRadius: "50%", background: "var(--color-running)", marginRight: "5px", verticalAlign: "middle" }} />
              {runningCount} running
            </span>
          )}
        </div>

        <button
          onClick={() => setShowLaunch(true)}
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
          + Launch Agent
        </button>
      </header>

      {/* Body: agents list + output */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left: agents */}
        <div
          style={{
            width: "280px",
            flexShrink: 0,
            borderRight: "1px solid var(--color-border-subtle)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "12px",
              borderBottom: "1px solid var(--color-border-subtle)",
              fontSize: "11px",
              color: "var(--color-text-faint)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Sessions ({agents.length})
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
            {agents.length === 0 ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "var(--color-text-faint)",
                  fontSize: "12px",
                }}
              >
                No sessions yet
                <br />
                <button
                  onClick={() => setShowLaunch(true)}
                  style={{
                    marginTop: "12px",
                    padding: "6px 14px",
                    background: "var(--color-accent)",
                    border: "none",
                    borderRadius: "6px",
                    color: "white",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Launch one
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {agents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    selected={agent.id === selectedAgentId}
                    onSelect={() => setSelectedAgentId(agent.id)}
                    onKill={handleKill}
                    onRemove={handleRemove}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: output */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Output toolbar */}
          {selectedAgent && (
            <div
              style={{
                padding: "8px 14px",
                borderBottom: "1px solid var(--color-border-subtle)",
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text)" }}>
                {selectedAgent.label}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontFamily: "var(--font-mono)",
                  color: "var(--color-text-faint)",
                }}
              >
                {selectedAgent.command} {selectedAgent.flags.join(" ")}
              </span>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: "11px", color: "var(--color-text-faint)" }}>
                {output.length} lines
              </span>
              <label
                style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "var(--color-text-muted)", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  style={{ cursor: "pointer" }}
                />
                Auto-scroll
              </label>
              <button
                onClick={copyOutput}
                style={{
                  padding: "3px 10px",
                  background: "none",
                  border: "1px solid var(--color-border)",
                  borderRadius: "4px",
                  color: "var(--color-text-muted)",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
            </div>
          )}

          {/* Output content */}
          <div
            ref={outputRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              lineHeight: 1.6,
              color: "var(--color-text-muted)",
              background: "var(--color-bg)",
            }}
            onScroll={(e) => {
              const el = e.currentTarget;
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
              if (!atBottom) setAutoScroll(false);
            }}
          >
            {!selectedAgent ? (
              <div style={{ color: "var(--color-text-faint)", padding: "40px", textAlign: "center" }}>
                Select a session to view output
              </div>
            ) : output.length === 0 ? (
              <div style={{ color: "var(--color-text-faint)", padding: "20px 0" }}>
                {selectedAgent.status === "running" ? "Waiting for output…" : "No output captured"}
              </div>
            ) : (
              output.map((line, i) => (
                <div
                  key={i}
                  style={{
                    color: line.startsWith("[stderr]")
                      ? "var(--color-warning)"
                      : line.startsWith("✓")
                      ? "var(--color-success)"
                      : line.startsWith("✗") || line.startsWith("Error")
                      ? "var(--color-error)"
                      : line.startsWith("$")
                      ? "var(--color-accent)"
                      : line.startsWith("─")
                      ? "var(--color-border)"
                      : undefined,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                  }}
                >
                  {line}
                </div>
              ))
            )}
            {selectedAgent?.status === "running" && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", color: "var(--color-running)" }}>
                <span className="spin" style={{ display: "inline-block" }}>◌</span>
                <span style={{ fontSize: "11px" }}>running…</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showLaunch && (
        <LaunchAgentModal
          project={project}
          onLaunch={handleLaunch}
          onClose={() => setShowLaunch(false)}
        />
      )}
    </div>
  );
}
