"use client";

import { useState } from "react";
import { useMaxHeight, useOpenExternal } from "./hooks";
import { baseURL } from "@/baseUrl";

type ServerTimeResponse = {
  iso: string;
  epochMs: number;
};

export default function Home() {
  const maxHeight = useMaxHeight() ?? undefined;
  const openExternal = useOpenExternal();

  const [serverTime, setServerTime] = useState<string>("—");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onGetServerTime() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${baseURL}/api/time`, {cache: "no-store"});
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = (await res.json()) as ServerTimeResponse;
      setServerTime(data.iso);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onOpenCourse() {
    openExternal("https://codegym.cc/courses/java");
  }

  return (
      // <div className="font-sans w-full flex items-center justify-center p-6 sm:p-10 bg-white dark:bg-slate-950" style={{ maxHeight }}>
      <div className="font-sans w-full flex items-center justify-center bg-white dark:bg-slate-950" style={{ maxHeight }}>

        <div className=" w-full max-w-4xl overflow-hidden rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/30 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2">
            {/* X: IMAGE */}
            <div className="bg-sky-100/70 dark:bg-sky-900/25 p-5">
              <img
                  src="https://codegym.cc/assets/images/site/courses/course-pic/course-pic-python.svg"
                  alt="HelloWorld illustration"
                  draggable={false}
                  className="h-48 sm:h-full w-full rounded-xl object-cover"
              />

            </div>

            {/* X: TEXT + 2 BUTTONS */}
            <div className="p-6 sm:p-7 flex flex-col justify-center">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                HelloWorld — ChatGPT App
              </h1>

              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Server time: <b className="text-slate-900 dark:text-slate-100">{serverTime}</b>
              </p>

              {error && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    Error: {error}
                  </p>
              )}

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                {/* Button 1 */}
                <button
                    type="button"
                    onClick={onGetServerTime}
                    disabled={loading}
                    className=" cursor-pointer rounded-xl bg-sky-600 text-white px-4 py-2.5text-sm font-semibold hover:bg-sky-700 transition disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
                >
                  {loading ? "Loading..." : "Get Server Time"}
                </button>

                {/* Button 2 */}
                <button
                    type="button"
                    onClick={onOpenCourse}
                    className="cursor-pointer rounded-xl border border-sky-300 dark:border-sky-800 bg-white/60 dark:bg-slate-950/30 px-4 py-2.5 text-sm font-semibold text-sky-700 dark:text-sky-200 hover:bg-white dark:hover:bg-slate-950/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 "
                >
                  Open CodeGym
                </button>
              </div>

              <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">
                Two actions only: fetch data from <code>/api/time</code> and open an external link.
              </p>
            </div>
          </div>
        </div>
      </div>
  );
}