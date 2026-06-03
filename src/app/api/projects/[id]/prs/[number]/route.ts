import { NextRequest, NextResponse } from "next/server";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import { getProject } from "@/lib/data";

const exec = promisify(execFile);
type Params = Promise<{ id: string; number: string }>;

function validatePrNumber(n: string): boolean {
  return /^\d+$/.test(n);
}

async function getPrDiff(cwd: string, number: string, repoArgs: string[] = []): Promise<{ diff: string; error?: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let stderr = "";
    const MAX_BYTES = 1024 * 1024; // 1 MB cap
    let totalBytes = 0;
    let truncated = false;

    const child = spawn("gh", ["pr", "diff", number, ...repoArgs], { cwd });

    child.stdout.on("data", (chunk: Buffer) => {
      if (truncated) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BYTES) {
        truncated = true;
        chunks.push(Buffer.from("\n\n[Diff truncated — too large to display]"));
        child.kill();
        return;
      }
      chunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    child.on("close", (code) => {
      const diff = Buffer.concat(chunks).toString("utf8");
      if (!diff && code !== 0) {
        resolve({ diff: "", error: stderr.trim() || `gh exited with code ${code}` });
      } else {
        resolve({ diff });
      }
    });

    child.on("error", (err) => resolve({ diff: "", error: err.message }));
  });
}

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const { id, number } = await params;

  if (!validatePrNumber(number)) {
    return NextResponse.json({ error: "Invalid PR number" }, { status: 400 });
  }

  const project = getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const cwd = project.repoPath;
  const repoArgs = project.githubRepo ? ["--repo", project.githubRepo] : [];

  // Fetch PR metadata and diff in parallel
  const [prResult, diffResult] = await Promise.all([
    exec("gh", ["pr", "view", number,
      ...repoArgs,
      "--json", "number,title,body,author,headRefName,baseRefName,state,url,isDraft,createdAt,additions,deletions,changedFiles,reviewDecision,reviews"
    ], { cwd, timeout: 15000 }).catch((e: unknown) => {
      const err = e as { stdout?: string; stderr?: string };
      return { stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
    }),
    getPrDiff(cwd, number, repoArgs),
  ]);

  let pr = null;
  try {
    const raw = (prResult as { stdout: string }).stdout?.trim();
    if (raw) pr = JSON.parse(raw);
  } catch { /* leave pr null */ }

  return NextResponse.json({ pr, diff: diffResult.diff, diffError: diffResult.error ?? null });
}
