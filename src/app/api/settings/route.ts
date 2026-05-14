import { NextResponse } from "next/server";
import { getSettings, updateSettings } from "@/lib/data";

export async function GET() {
  return NextResponse.json(getSettings());
}

export async function PUT(req: Request) {
  try {
    const updates = await req.json();
    updateSettings(updates);
    return NextResponse.json(getSettings());
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
