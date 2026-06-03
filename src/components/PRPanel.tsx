"use client";
import { useEffect, useState, useCallback } from "react";

interface PR {
  number: number;
  title: string;
  author: { login: string };
  headRefName: string;
  baseRefName: string;
  state: string;
  url: string;
  isDraft: boolean;
  createdAt: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  reviewDecision?: string;
}

interface PRDetail {
  pr: PR & { body: string; reviews: { author: { login: string }; state: string }[] } | null;
  diff: string;
  diffError: string | null;
}

interface Props {
  projectId: string;
  githubRepo?: string;
}

function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <pre style={{
      margin: 0,
      padding: "12px 16px",
      fontFamily: "var(--font-mono)",
      fontSize: 12,
      lineHeight: 1.6,
      overflowX: "auto",
      whiteSpace: "pre",
    }}>
      {lines.map((line, i) => {
        let color = "var(--color-text-faint)";
        let bg = "transparent";
        if (line.startsWith("+") && !line.startsWith("+++")) { color = "#4ade80"; bg = "rgba(74,222,128,0.06)"; }
        else if (line.startsWith("-") && !line.startsWith("---")) { color = "#f87171"; bg = "rgba(248,113,113,0.06)"; }
        else if (line.startsWith("@@")) { color = "#60a5fa"; }
        else if (line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++")) { color = "var(--color-text)"; }
        return (
          <span key={i} style={{ display: "block", background: bg, color }}>{line || " "}</span>
        );
      })}
    </pre>
  );
}

export default function PRPanel({ projectId, githubRepo: initialGithubRepo }: Props) {
  const [prs, setPrs] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPr, setSelectedPr] = useState<number | null>(null);
  const [detail, setDetail] = useState<PRDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [reviewResult, setReviewResult] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [repoInput, setRepoInput] = useState(initialGithubRepo ?? "");
  const [repoSaving, setRepoSaving] = useState(false);

  const fetchPrs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/prs`);
      const data = await res.json();
      if (data.error) { setError(data.error); setPrs([]); }
      else setPrs(data.prs ?? []);
    } catch {
      setError("Failed to fetch pull requests");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const saveGithubRepo = useCallback(async () => {
    setRepoSaving(true);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubRepo: repoInput.trim() || null }),
      });
      fetchPrs();
    } finally {
      setRepoSaving(false);
    }
  }, [projectId, repoInput, fetchPrs]);

  useEffect(() => { fetchPrs(); }, [fetchPrs]);

  const selectPr = useCallback(async (n: number) => {
    setSelectedPr(n);
    setDetail(null);
    setDetailLoading(true);
    setComment("");
    setReviewResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/prs/${n}`);
      const data = await res.json();
      setDetail(data);
    } catch {
      setDetail({ pr: null, diff: "", diffError: "Failed to load PR" });
    } finally {
      setDetailLoading(false);
    }
  }, [projectId]);

  const submitReview = useCallback(async (event: string) => {
    if (!selectedPr) return;
    setSubmitting(event);
    setReviewResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/prs/${selectedPr}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, comment }),
      });
      const data = await res.json();
      setReviewResult(data);
      if (data.ok) { setComment(""); fetchPrs(); }
    } catch {
      setReviewResult({ error: "Request failed" });
    } finally {
      setSubmitting(null);
    }
  }, [selectedPr, comment, projectId, fetchPrs]);

  const relativeTime = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const h = Math.floor(ms / 3600000);
    if (h < 1) return `${Math.floor(ms / 60000)}m ago`;
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const panelBase: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  };

  return (
    <div style={{ ...panelBase, flexDirection: "row" }}>
      {/* Left: PR list */}
      <div style={{
        width: 280,
        flexShrink: 0,
        borderRight: "1px solid var(--color-border)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 14px",
          borderBottom: "1px solid var(--color-border-subtle)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text)" }}>Pull Requests</span>
            <button
              onClick={fetchPrs}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-faint)", fontSize: 14, padding: 2 }}
              title="Refresh"
            >↻</button>
          </div>
          {/* GitHub repo override */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") saveGithubRepo(); }}
              placeholder="owner/repo override"
              title="Override which GitHub repo to list PRs from (e.g. microsoftdocs/windows-dev-docs-pr)"
              style={{
                flex: 1,
                background: "var(--color-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: 4,
                color: "var(--color-text)",
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                padding: "3px 7px",
                outline: "none",
              }}
            />
            <button
              onClick={saveGithubRepo}
              disabled={repoSaving}
              style={{ background: "none", border: "1px solid var(--color-border)", borderRadius: 4, cursor: "pointer", color: "var(--color-text-faint)", fontSize: 11, padding: "3px 8px" }}
              title="Save repo override and refresh"
            >
              {repoSaving ? "…" : "Set"}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && (
            <div style={{ padding: 16, color: "var(--color-text-faint)", fontSize: 12 }}>Loading…</div>
          )}
          {error && !loading && (
            <div style={{ padding: 16, color: "#f87171", fontSize: 12 }}>{error}</div>
          )}
          {!loading && !error && prs.length === 0 && (
            <div style={{ padding: 16, color: "var(--color-text-faint)", fontSize: 12 }}>No open pull requests</div>
          )}
          {prs.map((pr) => {
            const active = selectedPr === pr.number;
            return (
              <div
                key={pr.number}
                onClick={() => selectPr(pr.number)}
                style={{
                  padding: "10px 14px",
                  cursor: "pointer",
                  borderLeft: `3px solid ${active ? "var(--color-accent)" : "transparent"}`,
                  background: active ? "var(--color-surface)" : "transparent",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: "var(--color-accent)", fontFamily: "var(--font-mono)" }}>#{pr.number}</span>
                  {pr.isDraft && (
                    <span style={{ fontSize: 10, background: "var(--color-border)", color: "var(--color-text-faint)", borderRadius: 3, padding: "1px 5px" }}>Draft</span>
                  )}
                  <span style={{ fontSize: 10, color: "var(--color-text-faint)", marginLeft: "auto" }}>{relativeTime(pr.createdAt)}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text)", lineHeight: 1.4, marginBottom: 4 }}>{pr.title}</div>
                <div style={{ fontSize: 11, color: "var(--color-text-faint)", display: "flex", gap: 8 }}>
                  <span>{pr.author.login}</span>
                  <span style={{ fontFamily: "var(--font-mono)" }}>{pr.headRefName} → {pr.baseRefName}</span>
                </div>
                <div style={{ fontSize: 11, marginTop: 4, display: "flex", gap: 8 }}>
                  <span style={{ color: "#4ade80" }}>+{pr.additions}</span>
                  <span style={{ color: "#f87171" }}>-{pr.deletions}</span>
                  <span style={{ color: "var(--color-text-faint)" }}>{pr.changedFiles} file{pr.changedFiles !== 1 ? "s" : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: diff + review */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selectedPr && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, color: "var(--color-text-faint)" }}>Select a pull request</span>
          </div>
        )}

        {selectedPr && (
          <>
            {/* PR header */}
            {detail?.pr && (
              <div style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--color-border-subtle)",
                flexShrink: 0,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 6 }}>
                  <a
                    href={detail.pr.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text)", textDecoration: "none" }}
                  >
                    {detail.pr.title}
                  </a>
                  <span style={{ fontSize: 11, color: "var(--color-accent)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>#{detail.pr.number}</span>
                </div>
                {detail.pr.body && (
                  <div style={{ fontSize: 12, color: "var(--color-text-faint)", lineHeight: 1.5, maxHeight: 60, overflow: "hidden" }}>
                    {detail.pr.body.slice(0, 200)}{detail.pr.body.length > 200 ? "…" : ""}
                  </div>
                )}
              </div>
            )}

            {/* Diff */}
            <div style={{ flex: 1, overflowY: "auto", background: "var(--color-bg)" }}>
              {detailLoading && (
                <div style={{ padding: 16, color: "var(--color-text-faint)", fontSize: 12 }}>Loading diff…</div>
              )}
              {detail?.diffError && (
                <div style={{ padding: 16, color: "#f87171", fontSize: 12 }}>{detail.diffError}</div>
              )}
              {detail?.diff && <DiffView diff={detail.diff} />}
            </div>

            {/* Review actions */}
            <div style={{
              borderTop: "1px solid var(--color-border)",
              padding: "12px 16px",
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Leave a review comment (required for Request Changes / Comment)…"
                rows={2}
                style={{
                  width: "100%",
                  background: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 6,
                  color: "var(--color-text)",
                  fontSize: 12,
                  fontFamily: "var(--font-sans)",
                  padding: "8px 10px",
                  resize: "vertical",
                  boxSizing: "border-box",
                  outline: "none",
                }}
              />
              {reviewResult && (
                <div style={{ fontSize: 12, color: reviewResult.ok ? "#4ade80" : "#f87171" }}>
                  {reviewResult.ok ? "✓ Review submitted" : `✗ ${reviewResult.error}`}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {(["APPROVE", "REQUEST_CHANGES", "COMMENT"] as const).map((ev) => {
                  const label = ev === "APPROVE" ? "✓ Approve" : ev === "REQUEST_CHANGES" ? "✗ Request Changes" : "💬 Comment";
                  const activeColor = ev === "APPROVE" ? "#4ade80" : ev === "REQUEST_CHANGES" ? "#f87171" : "var(--color-accent)";
                  return (
                    <button
                      key={ev}
                      onClick={() => submitReview(ev)}
                      disabled={!!submitting}
                      style={{
                        padding: "6px 12px",
                        fontSize: 12,
                        background: "var(--color-surface)",
                        border: `1px solid ${activeColor}`,
                        borderRadius: 6,
                        color: activeColor,
                        cursor: submitting ? "not-allowed" : "pointer",
                        opacity: submitting ? 0.6 : 1,
                        fontFamily: "var(--font-sans)",
                      }}
                    >
                      {submitting === ev ? "…" : label}
                    </button>
                  );
                })}
                <a
                  href={detail?.pr?.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    marginLeft: "auto",
                    padding: "6px 12px",
                    fontSize: 12,
                    background: "none",
                    border: "1px solid var(--color-border)",
                    borderRadius: 6,
                    color: "var(--color-text-faint)",
                    cursor: "pointer",
                    textDecoration: "none",
                    fontFamily: "var(--font-sans)",
                  }}
                >
                  Open on GitHub ↗
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
