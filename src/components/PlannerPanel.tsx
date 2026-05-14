"use client";
import { useState, useEffect, useCallback } from "react";
import type { PlannerTask, TaskStatus } from "@/types";

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: "#8b949e",
  "in-progress": "#58a6ff",
  done: "#3fb950",
  blocked: "#f85149",
};

const STATUS_ICONS: Record<TaskStatus, string> = {
  todo: "○",
  "in-progress": "◎",
  done: "●",
  blocked: "✕",
};

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: "in-progress",
  "in-progress": "done",
  done: "todo",
  blocked: "todo",
};

export default function PlannerPanel({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/plan`);
    if (res.ok) setTasks(await res.json());
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

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

  async function cycleStatus(task: PlannerTask) {
    await fetch(`/api/projects/${projectId}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, status: NEXT_STATUS[task.status] }),
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

  async function setPriority(task: PlannerTask, priority: 1 | 2 | 3) {
    await fetch(`/api/projects/${projectId}/plan`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, priority }),
    });
    load();
  }

  const groups: Record<TaskStatus, PlannerTask[]> = {
    "in-progress": tasks.filter((t) => t.status === "in-progress"),
    blocked: tasks.filter((t) => t.status === "blocked"),
    todo: tasks.filter((t) => t.status === "todo"),
    done: tasks.filter((t) => t.status === "done"),
  };

  const renderTask = (task: PlannerTask) => {
    const isExpanded = expandedId === task.id;
    const notes = editingNotes[task.id] ?? task.notes;
    return (
      <div key={task.id} style={{
        background: "#161b22", border: "1px solid #21262d",
        borderRadius: 6, marginBottom: 6, overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", padding: "8px 10px", gap: 8 }}>
          <button
            onClick={() => cycleStatus(task)}
            title={`Status: ${task.status} (click to cycle)`}
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: STATUS_COLORS[task.status], fontSize: 16, lineHeight: 1,
              padding: 0, flexShrink: 0,
            }}
          >
            {STATUS_ICONS[task.status]}
          </button>
          <span style={{
            flex: 1, fontSize: 13, color: task.status === "done" ? "#484f58" : "#c9d1d9",
            textDecoration: task.status === "done" ? "line-through" : "none",
            cursor: "pointer",
          }} onClick={() => setExpandedId(isExpanded ? null : task.id)}>
            {task.title}
          </span>
          <span style={{ fontSize: 10, color: "#484f58", marginRight: 4 }}>
            {"▲".repeat(task.priority === 1 ? 3 : task.priority === 2 ? 2 : 1)}
          </span>
          <button onClick={() => deleteTask(task.id)} title="Delete" style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#484f58", fontSize: 14, padding: 0,
          }}>✕</button>
        </div>

        {isExpanded && (
          <div style={{ padding: "0 10px 10px", borderTop: "1px solid #21262d" }}>
            <div style={{ display: "flex", gap: 6, margin: "8px 0 6px" }}>
              {([1, 2, 3] as const).map((p) => (
                <button key={p} onClick={() => setPriority(task, p)} style={{
                  background: task.priority === p ? "#f97316" : "#21262d",
                  border: "none", borderRadius: 3, color: task.priority === p ? "#fff" : "#8b949e",
                  fontSize: 10, padding: "2px 8px", cursor: "pointer",
                }}>
                  {p === 1 ? "High" : p === 2 ? "Medium" : "Low"}
                </button>
              ))}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setEditingNotes((prev) => ({ ...prev, [task.id]: e.target.value }))}
              onBlur={() => saveNotes(task)}
              placeholder="Add notes..."
              rows={3}
              style={{
                width: "100%", background: "#0d1117", border: "1px solid #30363d",
                borderRadius: 4, color: "#c9d1d9", fontSize: 12, fontFamily: "inherit",
                padding: "6px 8px", resize: "vertical", boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ height: "100%", overflow: "auto", padding: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="New task... (Enter to add)"
            style={{
              flex: 1, background: "#161b22", border: "1px solid #30363d",
              borderRadius: 6, color: "#c9d1d9", padding: "8px 10px", fontSize: 13,
            }}
          />
          <button onClick={addTask} style={{
            background: "#f97316", border: "none", borderRadius: 6,
            color: "#fff", padding: "8px 14px", cursor: "pointer", fontWeight: 600,
          }}>+</button>
        </div>
      </div>

      {(["in-progress", "blocked", "todo", "done"] as TaskStatus[]).map((status) => {
        const group = groups[status];
        if (group.length === 0) return null;
        return (
          <div key={status} style={{ marginBottom: 16 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              color: STATUS_COLORS[status], textTransform: "uppercase",
              marginBottom: 6, display: "flex", alignItems: "center", gap: 6,
            }}>
              {STATUS_ICONS[status]} {status} <span style={{ color: "#484f58" }}>({group.length})</span>
            </div>
            {group.map(renderTask)}
          </div>
        );
      })}

      {tasks.length === 0 && (
        <div style={{ color: "#484f58", fontSize: 13, textAlign: "center", marginTop: 40 }}>
          No tasks yet. Add one above.
        </div>
      )}
    </div>
  );
}
