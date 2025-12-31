import { NextResponse } from "next/server";
import { normalizeLocale } from "@/lib/i18n/normalize-locale";
import { UI_MESSAGES } from "@/lib/i18n/ui-messages";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const localeInput = url.searchParams.get("locale");

  const { locale } = normalizeLocale(localeInput);
  const messages = UI_MESSAGES[locale];

  return NextResponse.json(
    { locale, messages },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}