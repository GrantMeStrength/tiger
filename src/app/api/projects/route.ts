import { NextResponse } from "next/server";
import { getProjects, addProject } from "@/lib/data";
import { randomUUID } from "crypto";

export async function GET() {
  const projects = getProjects();
  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, repoPath, description = "", defaultCommand, defaultFlags } = body;
    if (!name || !repoPath) {
      return NextResponse.json({ error: "name and repoPath are required" }, { status: 400 });
    }
    const project = {
      id: randomUUID(),
      name,
      repoPath,
      description,
      defaultCommand: defaultCommand ?? "gh copilot code",
      defaultFlags: defaultFlags ?? ["--yolo", "--resume"],
      createdAt: new Date().toISOString(),
    };
    addProject(project);
    return NextResponse.json(project, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
