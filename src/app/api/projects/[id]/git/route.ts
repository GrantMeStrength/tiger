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
