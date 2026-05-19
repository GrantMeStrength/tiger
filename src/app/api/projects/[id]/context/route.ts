import { NextRequest, NextResponse } from "next/server";
import { getProject, getContext, saveContext } from "@/lib/data";
import type { ContextSection } from "@/types";

type Params = Promise<{ id: string }>;

function toMarkdown(sections: ContextSection[]): string {
  return sections
    .filter((s) => s.content.trim())
    .map((s) => `## ${s.title}\n\n${s.content.trim()}`)
    .join("\n\n---\n\n");
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const brief = getContext(id);
  return NextResponse.json({ ...brief, markdown: toMarkdown(brief.sections) });
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  if (!getProject(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  if (!Array.isArray(body.sections)) {
    return NextResponse.json({ error: "sections array required" }, { status: 400 });
  }
  const sections = (body.sections as ContextSection[]).map((s) => ({
    key: String(s.key),
    title: String(s.title),
    content: String(s.content ?? ""),
  }));
  const brief = saveContext(id, sections);
  return NextResponse.json({ ...brief, markdown: toMarkdown(brief.sections) });
}
