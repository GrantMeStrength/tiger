"use client";
import { useState, useEffect, useRef, useCallback } from "react";

export default function MemoryPanel({ projectId }: { projectId: string }) {
  const [localContent, setLocalContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");
  const [externalChange, setExternalChange] = useState(false);
  const isEditingRef = useRef(false);

  // Initial load
  useEffect(() => {
    fetch(`/api/projects/${projectId}/memory`)
      .then((r) => r.json())
      .then((d) => {
        setLocalContent(d.content ?? "");
        setSavedContent(d.content ?? "");
      });
  }, [projectId]);

  // Poll for external changes every 3s
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/projects/${projectId}/memory`);
      if (!res.ok) return;
      const { content } = await res.json();
      if (content !== savedContent) {
        if (!isEditingRef.current && localContent === savedContent) {
          // No unsaved changes — apply the update silently
          setLocalContent(content);
          setSavedContent(content);
          setExternalChange(false);
        } else {
          // User has unsaved changes — warn them
          setExternalChange(true);
        }
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [projectId, savedContent, localContent]);

  const save = useCallback(async (content: string) => {
    setSaveStatus("saving");
    const res = await fetch(`/api/projects/${projectId}/memory`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      setSavedContent(content);
      setSaveStatus("saved");
      setExternalChange(false);
    }
  }, [projectId]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalContent(e.target.value);
    setSaveStatus("unsaved");
  };

  const handleBlur = () => {
    isEditingRef.current = false;
    if (saveStatus === "unsaved") save(localContent);
  };

  const isDirty = saveStatus === "unsaved" || saveStatus === "saving";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "16px" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "10px", flexShrink: 0,
      }}>
        <span style={{ fontSize: "11px", color: "var(--color-text-faint)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Project Memory
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {externalChange && (
            <span style={{ fontSize: "11px", color: "var(--color-warning)" }}>
              ⚠ updated externally
            </span>
          )}
          <span style={{
            fontSize: "11px",
            color: saveStatus === "saving" ? "var(--color-text-faint)"
              : saveStatus === "unsaved" ? "var(--color-warning)"
              : "var(--color-success)",
          }}>
            {saveStatus === "saving" ? "saving…" : saveStatus === "unsaved" ? "unsaved" : "saved"}
          </span>
          {isDirty && (
            <button
              onClick={() => save(localContent)}
              style={{
                padding: "4px 10px", background: "none",
                border: "1px solid var(--color-border)", color: "var(--color-text-muted)",
                fontSize: "11px", cursor: "pointer",
              }}
            >
              Save
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <textarea
        value={localContent}
        onChange={handleChange}
        onFocus={() => { isEditingRef.current = true; }}
        onBlur={handleBlur}
        placeholder={`Notes and instructions for agents working on this project.\n\nAgents can read this file via $TIGER_MEMORY_FILE or $TIGER_MEMORY_URL.`}
        style={{
          flex: 1,
          width: "100%",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border-subtle)",
          color: "var(--color-text)",
          fontSize: "13px",
          fontFamily: "var(--font-mono)",
          lineHeight: 1.6,
          padding: "12px",
          resize: "none",
          outline: "none",
          boxSizing: "border-box",
        }}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "s") {
            e.preventDefault();
            save(localContent);
          }
        }}
      />
    </div>
  );
}
