import { NextResponse } from "next/server";
import { getAgents, registerTerminalAgent } from "@/lib/agents";
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
    let pid: number | null = null;
    let spawnFailed = false;
    let errorMsg = "";

    if (agentType === "copilot") {
      try {
        const spawnRes = await fetch(`http://localhost:${INTERNAL_PORT}/_tiger/spawn-copilot-sdk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            projectId: id,
            repoPath: project.repoPath,
            initialPrompt: task || "",
            model: body.model || null,
          }),
        });
        if (!spawnRes.ok) {
          const errData = await spawnRes.json().catch(() => ({ error: "spawn failed" }));
          spawnFailed = true;
          errorMsg = errData.error ?? "spawn failed";
        }
      } catch (err) {
        spawnFailed = true;
        errorMsg = String(err);
      }

      const record = registerTerminalAgent({
        id: agentId,
        projectId: id,
        agentType,
        label,
        task,
        command: "@github/copilot-sdk",
        flags: body.model ? [body.model] : [],
        repoPath: project.repoPath,
        pid: null,
        status: spawnFailed ? "failed" : "running",
        errorMessage: spawnFailed ? errorMsg : undefined,
      });
      return NextResponse.json(record, { status: 201 });
    }

    if (agentType === "terminal") {
      try {
        const spawnRes = await fetch(`http://localhost:${INTERNAL_PORT}/_tiger/spawn-pty`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId,
            projectId: id,
            cwd: project.repoPath,
            command: undefined,
            args: undefined,
            initialInput: undefined,
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
        agentType,
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

    return NextResponse.json({ error: "Unknown agent type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
