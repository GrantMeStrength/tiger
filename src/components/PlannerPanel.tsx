"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { PlannerTask, TaskStatus } from "@/types";

export default function PlannerPanel({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});
  const [showDone, setShowDone] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/plan`);
    if (res.ok) setTasks(await res.json());
  }, [projectId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [load]);

  async function addTask() {
    if (!newTitle.trim()) return;
    await fetch(`/api/projects/${projectId}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim() }),
    });
    setNewTitle("");
    load();
  }

  async function setStatus(task: PlannerTask, status: TaskStatus) {
    await fetch(`/api/projects/${projectId}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, status }),
    });
    load();
  }

  async function saveNotes(task: PlannerTask) {
    await fetch(`/api/projects/${projectId}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, notes: editingNotes[task.id] ?? task.notes }),
    });
    load();
  }

  async function deleteTask(taskId: string) {
    await fetch(`/api/projects/${projectId}/plan`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    });
    load();
  }

  // Drag reorder — active tasks only
  function onDragStart(id: string) { setDragId(id); }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id); }
  function onDragEnd() {
    if (!dragId || !dragOverId || dragId === dragOverId) { setDragId(null); setDragOverId(null); return; }
    setTasks((prev) => {
      const active = prev.filter((t) => t.status !== "done");
      const done = prev.filter((t) => t.status === "done");
      const from = active.findIndex((t) => t.id === dragId);
      const to = active.findIndex((t) => t.id === dragOverId);
      if (from === -1 || to === -1) return prev;
      const reordered = [...active];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      const next = [...reordered, ...done];
      // Debounce persist
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        fetch(`/api/projects/${projectId}/plan`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedIds: next.map((t) => t.id) }),
        });
      }, 400);
      return next;
    });
    setDragId(null);
    setDragOverId(null);
  }

  const active = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");

  const STATUS_LABEL: Partial<Record<TaskStatus, string>> = {
    "in-progress": "In Progress",
    blocked: "Blocked",
    todo: "",
  };

  const STATUS_COLOR: Partial<Record<TaskStatus, string>> = {
    "in-progress": "var(--color-running)",
    blocked: "var(--color-error)",
    todo: "var(--color-border)",
  };

  const renderTask = (task: PlannerTask, isDone = false) => {
    const isExpanded = expandedId === task.id;
    const notes = editingNotes[task.id] ?? task.notes;
    const isDragging = dragId === task.id;
    const isDragOver = dragOverId === task.id && dragId !== task.id;

    return (
      <div
        key={task.id}
        draggable={!isDone}
        onDragStart={() => !isDone && onDragStart(task.id)}
        onDragOver={(e) => !isDone && onDragOver(e, task.id)}
        onDragEnd={() => !isDone && onDragEnd()}
        style={{
          background: "var(--color-surface)",
          border: `1px solid ${isDragOver ? "var(--color-accent)" : "var(--color-surface-raised)"}`,
          borderRadius: 6,
          marginBottom: 5,
          overflow: "hidden",
          opacity: isDragging ? 0.4 : 1,
          cursor: isDone ? "default" : "grab",
          transition: "border-color 0.1s, opacity 0.1s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", gap: 8 }}>
          {/* Drag handle */}
          {!isDone && (
            <span style={{ color: "var(--color-text-faint)", fontSize: 12, cursor: "grab", userSelect: "none", flexShrink: 0 }}>⠿</span>
          )}

          {/* Status dot */}
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: isDone ? "var(--color-success)" : (STATUS_COLOR[task.status] ?? "var(--color-border)"),
          }} />

          {/* Title */}
          <span
            onClick={() => setExpandedId(isExpanded ? null : task.id)}
            style={{
              flex: 1, fontSize: 13,
              color: isDone ? "var(--color-text-faint)" : "var(--color-text)",
              textDecoration: isDone ? "line-through" : "none",
              cursor: "pointer",
            }}
          >
            {task.title}
            {STATUS_LABEL[task.status] && (
              <span style={{ fontSize: 10, color: STATUS_COLOR[task.status], marginLeft: 8, fontWeight: 600 }}>
                {STATUS_LABEL[task.status]}
              </span>
            )}
          </span>

          {/* Actions */}
          {!isDone ? (
            <button
              onClick={() => setStatus(task, "done")}
              title="Mark complete"
              style={{
                background: "none", border: "1px solid var(--color-success)", borderRadius: 4,
                color: "var(--color-success)", fontSize: 11, padding: "2px 8px",
                cursor: "pointer", flexShrink: 0,
              }}
            >Complete</button>
          ) : (
            <button
              onClick={() => setStatus(task, "todo")}
              title="Move back to To Do"
              style={{
                background: "none", border: "1px solid var(--color-border)", borderRadius: 4,
                color: "var(--color-text-muted)", fontSize: 11, padding: "2px 8px",
                cursor: "pointer", flexShrink: 0,
              }}
            >Reactivate</button>
          )}

          <button
            onClick={() => deleteTask(task.id)}
            title="Delete"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-faint)", fontSize: 13, padding: "0 2px", flexShrink: 0 }}
          >✕</button>
        </div>

        {isExpanded && (
          <div style={{ padding: "0 10px 10px", borderTop: "1px solid var(--color-surface-raised)" }}>
            {!isDone && (
              <div style={{ display: "flex", gap: 6, margin: "8px 0 6px" }}>
                {(["todo", "in-progress", "blocked"] as TaskStatus[]).map((s) => (
                  <button key={s} onClick={() => setStatus(task, s)} style={{
                    background: task.status === s ? "var(--color-accent-dim)" : "var(--color-surface-raised)",
                    border: `1px solid ${task.status === s ? "var(--color-accent)" : "transparent"}`,
                    borderRadius: 4, color: task.status === s ? "var(--color-accent)" : "var(--color-text-muted)",
                    fontSize: 11, padding: "3px 10px", cursor: "pointer", textTransform: "capitalize",
                  }}>
                    {s === "in-progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}
            <textarea
              value={notes}
              onChange={(e) => setEditingNotes((prev) => ({ ...prev, [task.id]: e.target.value }))}
              onBlur={() => saveNotes(task)}
              placeholder="Add notes…"
              rows={3}
              style={{
                width: "100%", background: "var(--color-bg)", border: "1px solid var(--color-border)",
                borderRadius: 4, color: "var(--color-text)", fontSize: 12, fontFamily: "inherit",
                padding: "6px 8px", resize: "vertical", boxSizing: "border-box", outline: "none",
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 16 }}>
      {/* Add task input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="New to-do… (Enter to add)"
          style={{
            flex: 1, background: "var(--color-surface)", border: "1px solid var(--color-border)",
            borderRadius: 6, color: "var(--color-text)", padding: "8px 10px", fontSize: 13, outline: "none",
          }}
        />
        <button onClick={addTask} style={{
          background: "var(--color-accent)", border: "none", borderRadius: 6,
          color: "#fff", padding: "8px 14px", cursor: "pointer", fontWeight: 600, fontSize: 14,
        }}>+</button>
      </div>

      {/* Active tasks */}
      {active.length === 0 && done.length === 0 && (
        <div style={{ color: "var(--color-text-faint)", fontSize: 13, textAlign: "center", marginTop: 40 }}>
          No to-dos yet. Add one above.
        </div>
      )}
      {active.map((t) => renderTask(t, false))}

      {/* Done section — collapsible */}
      {done.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setShowDone((v) => !v)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--color-text-faint)", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.08em", textTransform: "uppercase",
              display: "flex", alignItems: "center", gap: 6, padding: "4px 0", marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 9 }}>{showDone ? "▼" : "▶"}</span>
            Done <span style={{ fontWeight: 400 }}>({done.length})</span>
          </button>
          {showDone && done.map((t) => renderTask(t, true))}
        </div>
      )}
    </div>
  );
}


