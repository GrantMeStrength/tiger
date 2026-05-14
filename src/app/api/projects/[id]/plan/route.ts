import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getTasks, addTask, updateTask, deleteTask, getProject } from "@/lib/data";
import type { PlannerTask } from "@/types";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(getTasks(id));
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const task: PlannerTask = {
    id: randomUUID(),
    title: body.title ?? "New task",
    notes: body.notes ?? "",
    status: body.status ?? "todo",
    priority: body.priority ?? 2,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  addTask(id, task);
  return NextResponse.json(task, { status: 201 });
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const { taskId, ...updates } = body;
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
  try {
    const updated = updateTask(id, taskId, updates);
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const { taskId } = await req.json();
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 });
  deleteTask(id, taskId);
  return NextResponse.json({ ok: true });
}
