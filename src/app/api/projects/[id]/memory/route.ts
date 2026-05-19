import { NextRequest, NextResponse } from "next/server";
import { getProject, getMemory, saveMemory } from "@/lib/data";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ content: getMemory(id) });
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { content } = await req.json();
  if (typeof content !== "string") {
    return NextResponse.json({ error: "content must be a string" }, { status: 400 });
  }
  saveMemory(id, content);
  return NextResponse.json({ content });
}
