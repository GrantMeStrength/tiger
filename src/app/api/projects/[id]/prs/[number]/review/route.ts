import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getProject } from "@/lib/data";

const exec = promisify(execFile);
type Params = Promise<{ id: string; number: string }>;

function validatePrNumber(n: string): boolean {
  return /^\d+$/.test(n);
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id, number } = await params;

  if (!validatePrNumber(number)) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { event, comment = "" } = body as { event?: string; comment?: string };

  const validEvents = ["APPROVE", "REQUEST_CHANGES", "COMMENT"];
  if (!event || !validEvents.includes(event)) {
    return NextResponse.json({ error: "event must be APPROVE, REQUEST_CHANGES, or COMMENT" }, { status: 400 });
  }

  const args = ["pr", "review", number];
  if (project.githubRepo) args.push("--repo", project.githubRepo);
  if (event === "APPROVE") args.push("--approve");
  else if (event === "REQUEST_CHANGES") args.push("--request-changes");
  else args.push("--comment");

  if (comment.trim()) {
    args.push("-b", comment.trim());
  } else if (event !== "APPROVE") {
    return NextResponse.json({ error: "A comment body is required for REQUEST_CHANGES and COMMENT reviews" }, { status: 400 });
  }

  try {
    await exec("gh", args, { cwd: project.repoPath, timeout: 15000 });
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string };
    return NextResponse.json({ error: err.stderr?.trim() ?? err.message ?? "gh command failed" }, { status: 502 });
  }
}
