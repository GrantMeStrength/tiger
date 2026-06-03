import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getProject } from "@/lib/data";

const exec = promisify(execFile);
type Params = Promise<{ id: string }>;

async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    const { stdout } = await exec("git", args, { cwd });
    return stdout.trim();
  } catch (e: unknown) {
    if (e && typeof e === "object" && "stdout" in e) return (e as { stdout: string }).stdout.trim();
    return "";
  }
}

async function gitOrError(cwd: string, ...args: string[]): Promise<{ out: string; error?: string }> {
  try {
    const { stdout } = await exec("git", args, { cwd, timeout: 30000 });
    return { out: stdout.trim() };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { out: err.stdout?.trim() ?? "", error: err.stderr?.trim() ?? err.message ?? "git command failed" };
  }
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cwd = project.repoPath;

  const [branch, status, log, diffStat, stash] = await Promise.all([
    git(cwd, "rev-parse", "--abbrev-ref", "HEAD"),
    git(cwd, "status", "--short"),
    git(cwd, "log", "--oneline", "-15"),
    git(cwd, "diff", "--stat", "HEAD"),
    git(cwd, "stash", "list"),
  ]);

  const changedFiles = status
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ flag: line.slice(0, 2).trim(), file: line.slice(3).trim() }));

  const commits = log
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ hash: line.slice(0, 7), message: line.slice(8) }));

  const stashes = stash
    .split("\n")
    .filter(Boolean)
    .map((line) => ({ label: line }));

  return NextResponse.json({ branch, changedFiles, commits, diffStat, stashes });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cwd = project.repoPath;
  const body = await req.json().catch(() => ({})) as { action?: string; message?: string; branch?: string };
  const { action, message, branch } = body;

  switch (action) {
    case "stage-all": {
      const r = await gitOrError(cwd, "add", "-A");
      return NextResponse.json(r.error ? { error: r.error } : { ok: true, out: r.out });
    }
    case "commit": {
      if (!message?.trim()) return NextResponse.json({ error: "Commit message is required" }, { status: 400 });
      const r = await gitOrError(cwd, "commit", "-m", message.trim());
      return NextResponse.json(r.error ? { error: r.error } : { ok: true, out: r.out });
    }
    case "stage-and-commit": {
      if (!message?.trim()) return NextResponse.json({ error: "Commit message is required" }, { status: 400 });
      const stage = await gitOrError(cwd, "add", "-A");
      if (stage.error) return NextResponse.json({ error: stage.error });
      const commit = await gitOrError(cwd, "commit", "-m", message.trim());
      return NextResponse.json(commit.error ? { error: commit.error } : { ok: true, out: commit.out });
    }
    case "push": {
      const r = await gitOrError(cwd, "push");
      return NextResponse.json(r.error ? { error: r.error } : { ok: true, out: r.out });
    }
    case "pull": {
      const r = await gitOrError(cwd, "pull");
      return NextResponse.json(r.error ? { error: r.error } : { ok: true, out: r.out });
    }
    case "new-branch": {
      if (!branch?.trim()) return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
      if (!/^[a-zA-Z0-9/_.-]+$/.test(branch.trim())) return NextResponse.json({ error: "Invalid branch name" }, { status: 400 });
      const r = await gitOrError(cwd, "checkout", "-b", branch.trim());
      return NextResponse.json(r.error ? { error: r.error } : { ok: true, out: r.out });
    }
    case "stash": {
      const r = await gitOrError(cwd, "stash");
      return NextResponse.json(r.error ? { error: r.error } : { ok: true, out: r.out });
    }
    case "stash-pop": {
      const r = await gitOrError(cwd, "stash", "pop");
      return NextResponse.json(r.error ? { error: r.error } : { ok: true, out: r.out });
    }
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}

