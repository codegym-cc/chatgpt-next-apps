"use client";

import Link from "next/link";
import { useIsChatGptApp, useMaxHeight } from "./hooks";

export default function Home() {
  const maxHeight = useMaxHeight() ?? undefined;
  const isChatGptApp = useIsChatGptApp();

  return (
    <div
      className="w-full flex items-center justify-center bg-white dark:bg-slate-950"
      style={{ maxHeight }}
    >
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Localization + Location Weather Demo App
        </h1>

        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-xl">
          Two MCP tools → two widgets. UI uses runtime i18n (next-intl + fetch), server resolves
          location → units/timezone.
        </p>

        {!isChatGptApp && (
          <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
            This is a regular browser. In ChatGPT Dev Mode, call{" "}
            <code className="font-mono">weather_day</code> or{" "}
            <code className="font-mono">weather_week</code> to render widgets.
          </div>
        )}

        <div className="mt-6 flex gap-3 flex-wrap">
          <Link
            href="/widgets/day"
            prefetch={false}
            className="rounded-xl bg-sky-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-sky-700"
          >
            Open Day Widget
          </Link>

          <Link
            href="/widgets/week"
            prefetch={false}
            className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
          >
            Open Week Widget
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          MCP endpoint: <code className="font-mono">/mcp</code>
        </p>
      </div>
    </div>
  );
}