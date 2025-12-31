import { NextResponse } from "next/server";

/**
 * Disable caching so the time is always "live".
 * (With the Next.js App Router, caching can otherwise be applied implicitly.)
 */
export const dynamic = "force-dynamic";

export async function GET() {
    const now = new Date();

    return NextResponse.json(
        {
            iso: now.toISOString(),
            epochMs: now.getTime(),
        },
        {
            headers: {
                // Extra safety to prevent any intermediate caches
                "Cache-Control": "no-store",
            },
        }
    );
}
