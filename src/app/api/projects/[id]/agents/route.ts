import { NextResponse } from "next/server";
import { getAgents, launchAgent } from "@/lib/agents";
import { getProject } from "@/lib/data";
import { randomUUID } from "crypto";

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
    const { label, task = "", command, flags } = body;
    if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

    const agent = launchAgent({
      id: randomUUID(),
      projectId: id,
      label,
      task,
      command: command ?? project.defaultCommand,
      flags: flags ?? project.defaultFlags,
      repoPath: project.repoPath,
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
