"use client";

import Link from "next/link";
import { useIsChatGptApp, useMaxHeight } from "./hooks";

export default function Home() {
  const maxHeight = useMaxHeight() ?? undefined;
  const isChatGptApp = useIsChatGptApp();

  return (
      <div
          className="font-sans w-full flex items-center justify-center bg-white dark:bg-slate-950"
          style={{ maxHeight }}
      >
        <div className="w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Private Jet Explorer (Widgets Demo)
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-xl">
            Educational app: thin UI / thick server. Two widgets: Explorer and Compare.
          </p>

          {!isChatGptApp && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This is a regular browser. In ChatGPT, widgets receive data via MCP tools.
                Open /explorer or /compare, but the full UX is revealed during tool calls.
              </div>
          )}

          <div className="mt-6 flex gap-3 flex-wrap">
            <Link
                href="/explorer"
                prefetch={false}
                className="rounded-xl bg-sky-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-sky-700"
            >
              Open Explorer
            </Link>
            <Link
                href="/compare"
                prefetch={false}
                className="rounded-xl border border-slate-300 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              Open Compare
            </Link>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            MCP endpoint: <code>/mcp</code>
          </p>
        </div>
      </div>
  );
}