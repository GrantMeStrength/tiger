"use client";
import { useState, useEffect, useCallback } from "react";

interface GitStatus {
  branch: string;
  changedFiles: { flag: string; file: string }[];
  commits: { hash: string; message: string }[];
  diffStat: string;
  stashes: { label: string }[];
}

const FLAG_COLORS: Record<string, string> = {
  M: "var(--color-warning)", A: "var(--color-success)", D: "var(--color-error)",
  R: "var(--color-running)", "?": "var(--color-text-muted)", "!": "var(--color-text-faint)",
};

export default function GitPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"status" | "log" | "diff">("status");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/git`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  if (loading && !data) return (
    <div style={{ padding: 16, color: "var(--color-text-faint)", fontSize: 13 }}>Loading git status…</div>
  );
  if (!data) return (
    <div style={{ padding: 16, color: "var(--color-error)", fontSize: 13 }}>Failed to read git status</div>
  );

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🌿</span>
          <span style={{ fontWeight: 700, color: "var(--color-running)", fontFamily: "var(--font-mono)", fontSize: 14 }}>
            {data.branch}
          </span>
          {data.changedFiles.length > 0 && (
            <span style={{
              background: "#e3b341", color: "#0d1117", borderRadius: 10,
              padding: "1px 7px", fontSize: 11, fontWeight: 700,
            }}>
              {data.changedFiles.length} changed
            </span>
          )}
          {data.stashes.length > 0 && (
            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{data.stashes.length} stash</span>
          )}
        </div>
        <button onClick={load} title="Refresh" style={{
          background: "var(--color-surface-raised)", border: "1px solid var(--color-border)", borderRadius: 6,
          color: "var(--color-text-muted)", padding: "4px 10px", cursor: "pointer", fontSize: 12,
        }}>↻ Refresh</button>
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>
        {(["status", "log", "diff"] as const).map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            background: activeTab === tab ? "var(--color-surface-raised)" : "transparent",
            border: activeTab === tab ? "1px solid var(--color-border)" : "1px solid transparent",
            borderRadius: 6, color: activeTab === tab ? "var(--color-text)" : "var(--color-text-muted)",
            padding: "4px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600,
            textTransform: "capitalize",
          }}>{tab}</button>
        ))}
      </div>

      {activeTab === "status" && (
        <div>
          {data.changedFiles.length === 0 ? (
            <div style={{ color: "var(--color-success)", fontSize: 13 }}>✓ Working tree clean</div>
          ) : (
            data.changedFiles.map((f, i) => (
              <div key={i} style={{
                fontFamily: "var(--font-mono)", fontSize: 12, padding: "3px 0",
                display: "flex", gap: 10,
              }}>
                <span style={{ color: FLAG_COLORS[f.flag[0]] ?? "var(--color-text-muted)", fontWeight: 700, minWidth: 20 }}>
                  {f.flag}
                </span>
                <span style={{ color: "var(--color-text)" }}>{f.file}</span>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "log" && (
        <div>
          {data.commits.length === 0 ? (
            <div style={{ color: "var(--color-text-faint)", fontSize: 13 }}>No commits</div>
          ) : (
            data.commits.map((c, i) => (
              <div key={i} style={{
                display: "flex", gap: 10, padding: "4px 0",
                borderBottom: "1px solid var(--color-surface)",
              }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-accent)",
                  minWidth: 55, flexShrink: 0,
                }}>{c.hash}</span>
                <span style={{ fontSize: 12, color: "var(--color-text)" }}>{c.message}</span>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "diff" && (
        <pre style={{
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--color-text-muted)",
          margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all",
        }}>
          {data.diffStat || "No diff"}
        </pre>
      )}
    </div>
  );
}
