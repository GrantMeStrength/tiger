import { getAgent, getAgentOutput } from "@/lib/agents";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; agentId: string }> }
) {
  const { agentId } = await params;
  const url = new URL(req.url);
  const since = parseInt(url.searchParams.get("since") ?? "0", 10);

  const agent = getAgent(agentId);
  if (!agent) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const output = getAgentOutput(agentId);
  return new Response(
    JSON.stringify({
      lines: output.slice(since),
      total: output.length,
      status: agent.status,
      exitCode: agent.exitCode,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
