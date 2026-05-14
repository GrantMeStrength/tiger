import { NextResponse } from "next/server";
import { loadSettings, saveSettings } from "@/lib/settings";

export async function GET() {
  const settings = loadSettings();
  // Mask secrets in the response — client shows them as placeholders
  return NextResponse.json({
    ...settings,
    githubToken: settings.githubToken ? "••••••••" : "",
    aiKey: settings.aiKey ? "••••••••" : "",
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const current = loadSettings();
    const updated = {
      ...current,
      ...body,
      // Don't overwrite secrets if the client sent back the masked placeholder
      githubToken: body.githubToken === "••••••••" ? current.githubToken : (body.githubToken ?? ""),
      aiKey: body.aiKey === "••••••••" ? current.aiKey : (body.aiKey ?? ""),
    };
    saveSettings(updated);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
