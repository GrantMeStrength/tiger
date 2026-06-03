import { NextResponse } from "next/server";
import { getAgent, updateAgentRecord } from "@/lib/agents";
import { getProject } from "@/lib/data";

const INTERNAL_PORT = process.env.PORT ?? "3000";

// Re-spawn the PTY for an existing agent — used when a session is lost after restart
// or when a process exits and the user wants to try again.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { id, agentId } = await params;

  const agent = getAgent(agentId);
  if (!agent || agent.projectId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const spawnRes = await fetch(`http://localhost:${INTERNAL_PORT}/_tiger/spawn-pty`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId,
        projectId: id,
        cwd: project.repoPath,
        command: agent.agentType === "terminal" ? undefined : agent.command,
        args: agent.agentType === "terminal" ? undefined : agent.flags,
        initialInput: agent.task || undefined,
      }),
    });

    if (!spawnRes.ok) {
      const err = await spawnRes.json().catch(() => ({ error: "spawn failed" }));
      return NextResponse.json({ error: err.error ?? "spawn failed" }, { status: 500 });
    }

    const { pid } = await spawnRes.json();

    const updated = updateAgentRecord(agentId, {
      status: "running",
      pid: pid ?? null,
      completedAt: null,
      exitCode: null,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
