import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import { getProject } from "@/lib/data";

const exec = promisify(execFile);
type Params = Promise<{ id: string }>;

async function gh(cwd: string, ...args: string[]): Promise<{ stdout: string; error?: string }> {
  try {
    const { stdout } = await exec("gh", args, { cwd, timeout: 15000 });
    return { stdout: stdout.trim() };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const stderr = err.stderr ?? err.message ?? "";
    if (stderr.includes("not logged into") || stderr.includes("GITHUB_TOKEN")) {
      return { stdout: "", error: "Not authenticated with GitHub. Run: gh auth login" };
    }
    if (stderr.includes("not a git repository") || stderr.includes("no remote")) {
      return { stdout: "", error: "No GitHub remote found for this project." };
    }
    return { stdout: err.stdout?.trim() ?? "", error: stderr.trim() };
  }
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id } = await params;
  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const repoArgs = project.githubRepo ? ["--repo", project.githubRepo] : [];
  const { stdout, error } = await gh(
    project.repoPath,
    "pr", "list",
    ...repoArgs,
    "--json", "number,title,author,headRefName,baseRefName,state,url,isDraft,createdAt,additions,deletions,changedFiles"
  );

  if (error && !stdout) return NextResponse.json({ error }, { status: 502 });

  try {
    const prs = JSON.parse(stdout || "[]");
    return NextResponse.json({ prs });
  } catch {
    return NextResponse.json({ error: "Failed to parse PR list" }, { status: 502 });
  }
}
