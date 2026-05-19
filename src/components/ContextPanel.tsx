"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import type { ContextSection } from "@/types";

const SECTION_PLACEHOLDERS: Record<string, string> = {
  goal: "What is this project trying to achieve? What problem does it solve?",
  architecture: "How is the codebase organized? Key technologies, patterns, and structural decisions.",
  conventions: "Naming conventions, file structure rules, style guidelines, preferred libraries.",
  constraints: "Things agents must NOT do. Limitations, gotchas, legacy decisions to be aware of.",
};

export default function ContextPanel({ projectId }: { projectId: string }) {
  const [sections, setSections] = useState<ContextSection[]>([]);
  const [savedSections, setSavedSections] = useState<ContextSection[]>([]);
  const [saveStatus, setSaveStatus] = useState<"saved" | "unsaved" | "saving">("saved");
  const [copyLabel, setCopyLabel] = useState("Copy for agent");
  const isEditingRef = useRef(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/context`)
      .then((r) => r.json())
      .then((d) => {
        setSections(d.sections ?? []);
        setSavedSections(d.sections ?? []);
      });
  }, [projectId]);

  const save = useCallback(
    async (current: ContextSection[]) => {
      setSaveStatus("saving");
      const res = await fetch(`/api/projects/${projectId}/context`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: current }),
      });
      if (res.ok) {
        const d = await res.json();
        setSavedSections(d.sections);
        setSaveStatus("saved");
      }
    },
    [projectId]
  );

  const handleChange = (key: string, content: string) => {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, content } : s)));
    setSaveStatus("unsaved");
  };

  const handleBlur = (current: ContextSection[]) => {
    isEditingRef.current = false;
    if (saveStatus === "unsaved") save(current);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      save(sections);
    }
  };

  const copyForAgent = async () => {
    const res = await fetch(`/api/projects/${projectId}/context`);
    const d = await res.json();
    await navigator.clipboard.writeText(d.markdown ?? "");
    setCopyLabel("Copied!");
    setTimeout(() => setCopyLabel("Copy for agent"), 2000);
  };

  const isDirty = saveStatus === "unsaved" || saveStatus === "saving";

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", padding: "16px", overflowY: "auto" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "16px", flexShrink: 0,
      }}>
        <span style={{
          fontSize: "11px", color: "var(--color-text-faint)", fontWeight: 600,
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          Project Brief
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
              onClick={() => save(sections)}
              style={{
                padding: "4px 10px", background: "none",
                border: "1px solid var(--color-border)", color: "var(--color-text-muted)",
                fontSize: "11px", cursor: "pointer",
              }}
            >
              Save
            </button>
          )}
          <button
            onClick={copyForAgent}
            style={{
              padding: "4px 10px", background: "none",
              border: "1px solid var(--color-border)", color: "var(--color-text-muted)",
              fontSize: "11px", cursor: "pointer",
            }}
          >
            {copyLabel}
          </button>
        </div>
      </div>

      {/* Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        {sections.map((section) => (
          <div key={section.key}>
            <div style={{
              fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)",
              textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px",
            }}>
              {section.title}
            </div>
            <textarea
              value={section.content}
              onChange={(e) => handleChange(section.key, e.target.value)}
              onFocus={() => { isEditingRef.current = true; }}
              onBlur={() => handleBlur(sections.map((s) => s.key === section.key ? { ...s, content: section.content } : s))}
              onKeyDown={handleKeyDown}
              placeholder={SECTION_PLACEHOLDERS[section.key] ?? ""}
              rows={4}
              style={{
                width: "100%",
                background: "var(--color-surface)",
                border: "1px solid var(--color-border-subtle)",
                color: "var(--color-text)",
                fontSize: "13px",
                fontFamily: "var(--font-sans)",
                lineHeight: 1.6,
                padding: "10px 12px",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLTextAreaElement).style.borderColor = "var(--color-border)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLTextAreaElement).style.borderColor = "var(--color-border-subtle)";
              }}
            />
          </div>
        ))}
      </div>

      <div style={{
        marginTop: "20px", padding: "10px 12px",
        border: "1px solid var(--color-border-subtle)",
        fontSize: "11px", color: "var(--color-text-faint)", lineHeight: 1.6,
      }}>
        Agents can read this brief via{" "}
        <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>
          GET /api/projects/{projectId}/context
        </code>
        {" "}— the response includes a <code style={{ fontFamily: "var(--font-mono)", color: "var(--color-text-muted)" }}>markdown</code> field ready to paste as context.
      </div>
    </div>
  );
}
