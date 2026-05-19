import { NextResponse } from "next/server";
import { getAgent, killAgent, removeAgent, renameAgent } from "@/lib/agents";

const INTERNAL_PORT = process.env.PORT ?? "3000";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { agentId } = await params;
  const agent = getAgent(agentId);
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(agent);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { agentId } = await params;
  const { label } = await req.json();
  if (!label?.trim()) return NextResponse.json({ error: "label is required" }, { status: 400 });
  const updated = renameAgent(agentId, label.trim());
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { agentId } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  if (force) {
    removeAgent(agentId);
    return NextResponse.json({ ok: true });
  }

  const agent = getAgent(agentId);

  // Kill PTY via server.js if this is a terminal agent
  if (agent?.agentType === "terminal" && agent.status === "running") {
    await fetch(`http://localhost:${INTERNAL_PORT}/_tiger/kill-pty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    }).catch(() => { /* ignore — PTY may have already exited */ });
  }

  const killed = killAgent(agentId);
  if (!killed) {
    removeAgent(agentId);
  }
  return NextResponse.json({ ok: true });
}
