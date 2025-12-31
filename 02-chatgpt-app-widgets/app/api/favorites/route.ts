import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Demo-only in-memory storage.
 * In production you'd use a DB / KV storage.
 */
const favorites = new Set<string>();

export async function GET() {
  return NextResponse.json(
    { items: Array.from(favorites) },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: Request) {
  const body = (await req.json()) as { jetId?: string };
  const jetId = body.jetId ?? "";

  favorites.add(jetId);

  return NextResponse.json(
    { ok: true, jetId, saved: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}