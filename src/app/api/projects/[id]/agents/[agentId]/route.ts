import { NextResponse } from "next/server";
import { getAgent, killAgent, removeAgent } from "@/lib/agents";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { agentId } = await params;
  const agent = getAgent(agentId);
  if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(agent);
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

  const killed = killAgent(agentId);
  if (!killed) {
    // Already done — just remove from registry
    removeAgent(agentId);
  }
  return NextResponse.json({ ok: true });
}
