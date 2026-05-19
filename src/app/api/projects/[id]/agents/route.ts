import { NextResponse } from "next/server";
import { getAgents, launchAgent, registerTerminalAgent } from "@/lib/agents";
import { getProject } from "@/lib/data";
import { randomUUID } from "crypto";

const INTERNAL_PORT = process.env.PORT ?? "3000";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return NextResponse.json(getAgents(id));
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const body = await req.json();
    const { label, task = "", command, flags, agentType = "copilot" } = body;
    if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

    const agentId = randomUUID();

    if (agentType === "terminal" || agentType === "copilot") {
      // Both terminal and copilot agents run in a PTY — full interactive support
      // Terminal: spawns bash; Copilot: spawns the configured command
      let pid: number | null = null;
      let spawnFailed = false;
      let errorMsg = "";

      const spawnCommand = agentType === "terminal" ? undefined : (command ?? project.defaultCommand);
      const spawnArgs = agentType === "terminal" ? undefined : (flags ?? project.defaultFlags);

      try {
        const spawnRes = await fetch(`http://localhost:${INTERNAL_PORT}/_tiger/spawn-pty`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            projectId: id,
            cwd: project.repoPath,
            command: spawnCommand,
            args: spawnArgs,
            initialInput: task || undefined,
          }),
        });
        if (!spawnRes.ok) {
          const errData = await spawnRes.json().catch(() => ({ error: "spawn failed" }));
          spawnFailed = true;
          errorMsg = errData.error ?? "spawn failed";
        } else {
          const data = await spawnRes.json();
          pid = data.pid ?? null;
        }
      } catch (err) {
        spawnFailed = true;
        errorMsg = String(err);
      }

      const record = registerTerminalAgent({
        id: agentId,
        projectId: id,
        label,
        task,
        command: command ?? project.defaultCommand,
        flags: flags ?? project.defaultFlags,
        repoPath: project.repoPath,
        pid,
        status: spawnFailed ? "failed" : "running",
        errorMessage: spawnFailed ? errorMsg : undefined,
      });
      return NextResponse.json(record, { status: 201 });
    }

    // Fallback for any future non-PTY agent types
    return NextResponse.json({ error: "Unknown agent type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
