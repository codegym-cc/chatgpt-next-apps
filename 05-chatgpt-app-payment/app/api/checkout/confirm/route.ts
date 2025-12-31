import { NextResponse } from "next/server";
import { z } from "zod";
import { checkoutService, SessionExpiredError, SessionNotFoundError } from "@/src/domain/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  checkoutSessionId: z.string().min(1)
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid checkoutSessionId" } },
      { status: 400 }
    );
  }

  try {
    const result = checkoutService.confirm(parsed.data.checkoutSessionId);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
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