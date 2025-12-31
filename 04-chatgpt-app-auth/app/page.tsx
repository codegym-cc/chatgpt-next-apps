"use client";

import { useEffect, useMemo, useState } from "react";
import { useMaxHeight, useCallTool, useIsChatGptApp } from "./hooks";

type WhoAmI = {
  userId: string;
  displayName: string;
};

type NotesList = {
  items: Array<{ id: string; title: string; updatedAt: string }>;
};

type NotesAdd = { ok: true; noteId: string };

type NotesTeaser =
  | { mode: "public"; items: Array<{ id: string; title: string; updatedAt: string }> }
  | { mode: "private"; userId: string; items: Array<{ id: string; title: string; updatedAt: string }> };

function decodeToolResult<T>(raw: unknown): T {
  // openai.callTool() return shape can differ; try to interpret.
  // In this template repo types declare { result: string | number }, but in practice it can be an object.
  const candidate = (raw as any)?.result ?? raw;

  if (typeof candidate === "string") {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // last resort
      return candidate as unknown as T;
    }
  }

  return candidate as T;
}

export default function Home() {
  const maxHeight = useMaxHeight() ?? undefined;
  const isChatGptApp = useIsChatGptApp();
  const callTool = useCallTool();

  const [status, setStatus] = useState<"unknown" | "not_connected" | "connected">("unknown");
  const [me, setMe] = useState<WhoAmI | null>(null);

  const [teaser, setTeaser] = useState<NotesTeaser | null>(null);
  const [notes, setNotes] = useState<NotesList | null>(null);

  const [title, setTitle] = useState("My note");
  const [body, setBody] = useState("Hello from the widget!");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const connectedLabel = useMemo(() => {
    if (status === "connected" && me) return `Connected as ${me.displayName}`;
    if (status === "not_connected") return "Not connected";
    return "Checking connection...";
  }, [status, me]);

  async function checkConnection() {
    setError(null);

    if (!callTool) {
      setStatus("not_connected");
      setMe(null);
      return;
    }

    try {
      const res = await callTool("auth_whoami", {});
      if (!res) throw new Error("callTool unavailable");
      const data = decodeToolResult<WhoAmI>(res);
      if (data?.userId) {
        setStatus("connected");
        setMe(data);
      } else {
        setStatus("not_connected");
        setMe(null);
      }
    } catch (e) {
      setStatus("not_connected");
      setMe(null);
      // don't hard-fail; being not connected is expected
    }
  }

  async function onPreviewNotes() {
    setBusy(true);
    setError(null);
    try {
      const res = await callTool("notes_teaser", {});
      if (!res) throw new Error("callTool unavailable");
      const data = decodeToolResult<NotesTeaser>(res);
      setTeaser(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLoadMyNotes() {
    setBusy(true);
    setError(null);
    try {
      const res = await callTool("notes_list", {});
      if (!res) throw new Error("callTool unavailable");
      const data = decodeToolResult<NotesList>(res);
      setNotes(data);
      // if it worked, we must be connected
      await checkConnection();
    } catch (e) {
      // Expected if not linked: the server returns 401 + WWW-Authenticate and ChatGPT should show linking UI.
      setError(
        e instanceof Error
          ? e.message
          : "Authentication required (you should see a linking prompt in ChatGPT)."
      );
      await checkConnection();
    } finally {
      setBusy(false);
    }
  }

  async function onAddNote() {
    setBusy(true);
    setError(null);
    try {
      const res = await callTool("notes_add", { title, body });
      if (!res) throw new Error("callTool unavailable");
      const data = decodeToolResult<NotesAdd>(res);

      if (!data?.ok) {
        throw new Error("Failed to add note");
      }

      // Refresh notes
      await onLoadMyNotes();
    } catch (e) {
      // If user has only notes:read, this should trigger 403 insufficient_scope and re-linking UI.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void checkConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="font-sans w-full flex items-center justify-center bg-white dark:bg-slate-950 p-4"
      style={{ maxHeight }}
    >
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 shadow-sm">
        <div className="p-6 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Auth Demo Widget
              </h1>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {connectedLabel}
              </p>
              {!isChatGptApp && (
                <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                  Tip: open this inside a ChatGPT App / MCP environment to test account linking.
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={checkConnection}
                disabled={busy}
                className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-60"
              >
                Check connection
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600 dark:text-red-400">
              Error: {error}
            </p>
          )}

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Not connected / teaser */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                State A: Not connected
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Preview public notes without linking.
              </p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onPreviewNotes}
                  disabled={busy}
                  className="rounded-xl bg-sky-600 text-white px-4 py-2 text-sm font-semibold hover:bg-sky-700 disabled:opacity-60"
                >
                  {busy ? "Working..." : "Preview notes (public)"}
                </button>

                <button
                  type="button"
                  onClick={onLoadMyNotes}
                  disabled={busy}
                  className="rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:opacity-60"
                >
                  Load my notes (private)
                </button>
              </div>

              {teaser && (
                <div className="mt-4">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Mode: <b>{teaser.mode}</b>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {teaser.items.map((n) => (
                      <li
                        key={n.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3"
                      >
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {n.title}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          Updated: {n.updatedAt}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Connected / notes + add */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                State B: Connected
              </h2>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                After linking, load notes and add notes (write scope may be required).
              </p>

              <div className="mt-3">
                <button
                  type="button"
                  onClick={onLoadMyNotes}
                  disabled={busy}
                  className="rounded-xl bg-emerald-600 text-white px-4 py-2 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60"
                >
                  Load my notes
                </button>
              </div>

              {notes && (
                <div className="mt-4">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    Notes: <b>{notes.items.length}</b>
                  </div>
                  <ul className="mt-2 space-y-2">
                    {notes.items.map((n) => (
                      <li
                        key={n.id}
                        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-3"
                      >
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {n.title}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-300">
                          Updated: {n.updatedAt}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-5 border-t border-slate-200 dark:border-slate-800 pt-4">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Add note
                </div>

                <div className="mt-2 space-y-2">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    placeholder="Title"
                  />
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
                    placeholder="Body"
                    rows={3}
                  />
                  <button
                    type="button"
                    onClick={onAddNote}
                    disabled={busy}
                    className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
                  >
                    Add note (needs notes:write)
                  </button>
                </div>

                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  If you only granted <code className="font-mono">notes:read</code>, calling add may trigger a
                  re-authorization prompt for <code className="font-mono">notes:write</code>.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-6 text-xs text-slate-600 dark:text-slate-300">
            Tools are protected via OAuth 2.1 + PKCE S256, with RS returning HTTP{" "}
            <code className="font-mono">WWW-Authenticate</code> and tool-level{" "}
            <code className="font-mono">_meta["mcp/www_authenticate"]</code> when auth is required.
          </p>
        </div>
      </div>
    </div>
  );
}