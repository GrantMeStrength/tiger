"use client";
import { useState, useEffect, useCallback } from "react";

const GRAPH_COL_W = 20;
const ROW_H = 28;
const DOT_R = 4;
const LINE_COLORS = [
  "var(--color-accent)",
  "var(--color-running)",
  "var(--color-success)",
  "var(--color-warning)",
];

function CommitGraph({ commits, currentBranch }: { commits: { hash: string; message: string }[]; currentBranch: string }) {
  // Simple single-lane graph (git log --oneline is already linearized)
  const H = commits.length * ROW_H;
  const cx = GRAPH_COL_W / 2;
  const color = LINE_COLORS[0];

  return (
    <div style={{ display: "flex", gap: 0, minHeight: H }}>
      {/* SVG lane */}
      <svg width={GRAPH_COL_W} height={H} style={{ flexShrink: 0 }}>
        {/* Vertical spine */}
        {commits.length > 1 && (
          <line
            x1={cx} y1={ROW_H / 2}
            x2={cx} y2={H - ROW_H / 2}
            stroke={color} strokeWidth={2} strokeOpacity={0.4}
          />
        )}
        {commits.map((c, i) => {
          const cy = i * ROW_H + ROW_H / 2;
          const isHead = i === 0;
          return (
            <g key={c.hash}>
              {/* Dot */}
              <circle cx={cx} cy={cy} r={isHead ? DOT_R + 1 : DOT_R} fill={isHead ? color : "var(--color-bg)"} stroke={color} strokeWidth={2} />
              {/* HEAD glow */}
              {isHead && (
                <circle cx={cx} cy={cy} r={DOT_R + 4} fill="none" stroke={color} strokeWidth={1} strokeOpacity={0.3} />
              )}
            </g>
          );
        })}
      </svg>

      {/* Commit info */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {commits.map((c, i) => {
          const isHead = i === 0;
          return (
            <div key={c.hash} style={{
              height: ROW_H,
              display: "flex",
              alignItems: "center",
              gap: 8,
              paddingLeft: 6,
              borderBottom: "1px solid var(--color-surface)",
            }}>
              <span style={{
                fontFamily: "var(--font-mono)", fontSize: 10.5,
                color: isHead ? color : "var(--color-text-faint)",
                minWidth: 52, flexShrink: 0,
              }}>
                {c.hash}
              </span>
              {isHead && (
                <span style={{
                  background: "var(--color-accent-dim)",
                  color: "var(--color-accent)",
                  border: "1px solid var(--color-accent)",
                  borderRadius: 4, padding: "0 5px", fontSize: 10, fontWeight: 700,
                  lineHeight: "16px", flexShrink: 0,
                }}>
                  HEAD · {currentBranch}
                </span>
              )}
              <span style={{
                fontSize: 12, color: isHead ? "var(--color-text)" : "var(--color-text-muted)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {c.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

function ActionButton({ label, onClick, disabled, variant = "default" }: {
  label: string; onClick: () => void; disabled?: boolean; variant?: "default" | "primary" | "danger";
}) {
  const colors = {
    default: { bg: "var(--color-surface-raised)", border: "var(--color-border)", color: "var(--color-text-muted)" },
    primary: { bg: "var(--color-accent-dim)", border: "var(--color-accent)", color: "var(--color-accent)" },
    danger:  { bg: "transparent", border: "var(--color-error)", color: "var(--color-error)" },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 6,
        color: colors.color, padding: "5px 11px", cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 12, opacity: disabled ? 0.5 : 1, fontFamily: "var(--font-sans)",
      }}
    >{label}</button>
  );
}

export default function GitPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"status" | "log" | "diff">("status");
  const [commitMsg, setCommitMsg] = useState("");
  const [newBranch, setNewBranch] = useState("");
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok?: boolean; error?: string; out?: string } | null>(null);

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

  const run = useCallback(async (action: string, extra: Record<string, string> = {}) => {
    setBusy(action);
    setResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      setResult(data);
      if (data.ok) {
        if (action === "new-branch") setShowBranchInput(false);
        setTimeout(load, 400);
      }
    } catch {
      setResult({ error: "Request failed" });
    } finally {
      setBusy(null);
    }
  }, [projectId, load]);

  if (loading && !data) return (
    <div style={{ padding: 16, color: "var(--color-text-faint)", fontSize: 13 }}>Loading git status…</div>
  );
  if (!data) return (
    <div style={{ padding: 16, color: "var(--color-error)", fontSize: 13 }}>Failed to read git status</div>
  );

  const hasChanges = data.changedFiles.length > 0;
  const hasStashes = data.stashes.length > 0;

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🌿</span>
          <span style={{ fontWeight: 700, color: "var(--color-running)", fontFamily: "var(--font-mono)", fontSize: 14 }}>
            {data.branch}
          </span>
          {hasChanges && (
            <span style={{
              background: "#e3b341", color: "#0d1117", borderRadius: 10,
              padding: "1px 7px", fontSize: 11, fontWeight: 700,
            }}>
              {data.changedFiles.length} changed
            </span>
          )}
          {hasStashes && (
            <span style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{data.stashes.length} stash</span>
          )}
        </div>
        <ActionButton label="↻ Refresh" onClick={load} disabled={loading} />
      </div>

      {/* Action bar */}
      <div style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 8,
        padding: 12,
        marginBottom: 14,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}>
        {/* Commit row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            value={commitMsg}
            onChange={(e) => setCommitMsg(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commitMsg.trim() && run("stage-and-commit", { message: commitMsg })}
            placeholder="Commit message…"
            style={{
              flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-border)",
              borderRadius: 6, color: "var(--color-text)", fontSize: 12, padding: "6px 10px",
              fontFamily: "var(--font-sans)", outline: "none",
            }}
          />
          <ActionButton
            label={busy === "stage-all" ? "…" : "Stage All"}
            onClick={() => run("stage-all")}
            disabled={!!busy || !hasChanges}
          />
          <ActionButton
            label={busy === "stage-and-commit" ? "…" : "Commit All"}
            onClick={() => run("stage-and-commit", { message: commitMsg })}
            disabled={!!busy || !commitMsg.trim()}
            variant="primary"
          />
        </div>

        {/* Push / Pull / Branch / Stash row */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton
            label={busy === "push" ? "Pushing…" : "⬆ Push"}
            onClick={() => run("push")}
            disabled={!!busy}
            variant="primary"
          />
          <ActionButton
            label={busy === "pull" ? "Pulling…" : "⬇ Pull"}
            onClick={() => run("pull")}
            disabled={!!busy}
          />
          <ActionButton
            label="⎇ New Branch"
            onClick={() => setShowBranchInput((v) => !v)}
            disabled={!!busy}
          />
          <ActionButton
            label={busy === "stash" ? "…" : "📦 Stash"}
            onClick={() => run("stash")}
            disabled={!!busy || !hasChanges}
          />
          {hasStashes && (
            <ActionButton
              label={busy === "stash-pop" ? "…" : "📤 Pop Stash"}
              onClick={() => run("stash-pop")}
              disabled={!!busy}
            />
          )}
        </div>

        {/* New branch input */}
        {showBranchInput && (
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && newBranch.trim() && run("new-branch", { branch: newBranch })}
              placeholder="branch-name"
              autoFocus
              style={{
                flex: 1, background: "var(--color-bg)", border: "1px solid var(--color-accent)",
                borderRadius: 6, color: "var(--color-text)", fontSize: 12, padding: "6px 10px",
                fontFamily: "var(--font-mono)", outline: "none",
              }}
            />
            <ActionButton
              label={busy === "new-branch" ? "…" : "Create"}
              onClick={() => run("new-branch", { branch: newBranch })}
              disabled={!!busy || !newBranch.trim()}
              variant="primary"
            />
            <ActionButton label="Cancel" onClick={() => setShowBranchInput(false)} />
          </div>
        )}

        {/* Result feedback */}
        {result && (
          <div style={{
            fontSize: 12, fontFamily: "var(--font-mono)",
            color: result.ok ? "var(--color-success)" : "var(--color-error)",
            background: result.ok ? "rgba(22,163,74,0.07)" : "rgba(220,38,38,0.07)",
            border: `1px solid ${result.ok ? "var(--color-success)" : "var(--color-error)"}`,
            borderRadius: 6, padding: "6px 10px", whiteSpace: "pre-wrap", wordBreak: "break-all",
          }}>
            {result.ok ? `✓ ${result.out || "Done"}` : `✗ ${result.error}`}
          </div>
        )}
      </div>

      {/* Tabs */}
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
            <CommitGraph commits={data.commits} currentBranch={data.branch} />
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

