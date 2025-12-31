import { NextResponse } from "next/server";
import { buildProtectedResourceMetadata } from "./metadata";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(buildProtectedResourceMetadata(), {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: "misconfigured", message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}