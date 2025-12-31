import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkoutService, SessionExpiredError, SessionNotFoundError } from "@/src/domain/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ sessionId: z.string().min(1) });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ sessionId: string }> }) {
    // Next.js 16 types `params` as Promise in route handlers.
    // `await` works even if the runtime passes a plain object (it will just resolve immediately).
    const params = await ctx.params;

    const parsedParams = ParamsSchema.safeParse(params);
    if (!parsedParams.success) {
        return NextResponse.json(
            { error: { code: "VALIDATION_ERROR", message: "Invalid sessionId" } },
            { status: 400 }
        );
    }

    const { sessionId } = parsedParams.data;

    try {
        const session = checkoutService.getSession(sessionId);
        return NextResponse.json(
            {
                id: session.id,
                status: session.status,
                currency: session.currency,
                total: session.total,
                lineItems: session.lineItems,
                orderId: session.orderId ?? null
            },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (err) {
        if (err instanceof SessionNotFoundError) {
            return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 404 });
        }
        if (err instanceof SessionExpiredError) {
            return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: 410 });
        }

        return NextResponse.json(
            { error: { code: "INTERNAL_ERROR", message: "Internal error" } },
            { status: 500 }
        );
    }
}