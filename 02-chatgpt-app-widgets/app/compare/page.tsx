"use client";

import { useMemo, useState } from "react";
import {
  useDisplayMode,
  useIsChatGptApp,
  useMaxHeight,
  useOpenExternal,
  useRequestDisplayMode,
  useSendMessage,
  useWidgetProps,
} from "../hooks";
import type { CompareRow, CompareViewModel } from "@/lib/jets/jets.types";

const EMPTY_TOOL_OUTPUT: any = {};

function asStructured<T>(raw: any): T {
  return raw?.result?.structuredContent ?? raw?.structuredContent ?? raw;
}

function fmtUsd(usd: number) {
  const m = usd / 1_000_000;
  return m >= 1 ? `$${Math.round(m)}M` : `$${Math.round(usd).toLocaleString()}`;
}

function fmtValue(row: CompareRow, v: number) {
  if (row.key === "priceEstimateUsd") return fmtUsd(v);
  if (row.key === "rangeKm") return `${Math.round(v).toLocaleString()} km`;
  if (row.key === "speedKmh") return `${Math.round(v)} km/h`;
  return `${v}`;
}

export default function ComparePage() {
  const maxHeight = useMaxHeight() ?? undefined;
  const displayMode = useDisplayMode();
  const requestDisplayMode = useRequestDisplayMode();
  const openExternal = useOpenExternal();
  const sendMessage = useSendMessage();
  const isChatGptApp = useIsChatGptApp();

  // Stable fallback object (avoid new {} each render)
  const toolOutputRaw = useWidgetProps<any>(EMPTY_TOOL_OUTPUT);
  const vm = asStructured<CompareViewModel | any>(toolOutputRaw);

  const isFullscreen = displayMode === "fullscreen";

  const ids = Array.isArray(vm?.ids) ? (vm.ids as string[]) : [];
  const jets = Array.isArray(vm?.jets) ? (vm.jets as CompareViewModel["jets"]) : [];
  const rows = Array.isArray(vm?.rows) ? (vm.rows as CompareRow[]) : [];
  const bestPickId = typeof vm?.bestPickId === "string" ? (vm.bestPickId as string) : null;
  const reasons = Array.isArray(vm?.reasons) ? (vm.reasons as string[]) : [];

  const bestJet = useMemo(() => jets.find((j) => j.id === bestPickId) ?? null, [jets, bestPickId]);

  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);

  async function loadFavorites() {
    setFavLoading(true);
    setFavError(null);
    try {
      const res = await fetch("/api/favorites", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: string[] };
      setFavorites(data.items ?? []);
    } catch (e) {
      setFavError(e instanceof Error ? e.message : String(e));
    } finally {
      setFavLoading(false);
    }
  }

  async function saveFavorite(jetId: string) {
    setFavLoading(true);
    setFavError(null);
    try {
      const res = await fetch("/api/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jetId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadFavorites();
    } catch (e) {
      setFavError(e instanceof Error ? e.message : String(e));
    } finally {
      setFavLoading(false);
    }
  }

  async function openDetailsViaChat(id: string) {
    const prompt = `Open details using get_jet: ${JSON.stringify({ id })}.  MUST call tool get_jet`;
    await sendMessage(prompt);
  }

  const hasData = ids.length >= 2 && jets.length >= 2 && rows.length >= 1 && !!bestPickId;

  return (
      <div
          className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
          style={{
            maxHeight,
            height: isFullscreen ? maxHeight : undefined,
          }}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Compare Jets</div>
              <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                Pure view-model rendering (thin UI / thick server)
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                  className="cursor-pointer text-xs rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-900"
                  onClick={loadFavorites}
                  disabled={favLoading}
                  title="GET /api/favorites"
              >
                {favLoading ? "Loading..." : `Favorites: ${favorites.length}`}
              </button>

              {!isFullscreen && (
                  <button
                      className="cursor-pointer text-xs rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-2 py-1"
                      onClick={() => requestDisplayMode("fullscreen")}
                  >
                    Expand
                  </button>
              )}
            </div>
          </div>

          {!isChatGptApp && (
              <div className="px-4 py-2 text-xs bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200">
                Tip: open via ChatGPT after calling <code className="font-mono">compare_jets</code>.
              </div>
          )}

          {favError && (
              <div className="px-4 py-2 text-xs text-red-700 dark:text-red-300 border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
                Favorites error: {favError}
              </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-auto p-4">
            {!hasData ? (
                <EmptyState
                    title="No comparison yet"
                    text='Pick 2+ jets in Explorer, then press "Compare" (it will send a follow-up so the model calls compare_jets).'
                />
            ) : (
                <div className="space-y-4">
                  {/* Best pick */}
                  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                      <div className="text-sm font-semibold">Best pick</div>
                      <div className="text-xs text-slate-600 dark:text-slate-300">
                        bestPickId: <code className="font-mono">{bestPickId}</code>
                      </div>
                    </div>

                    <div className="p-4">
                      {bestJet && (
                          <div className="flex items-center gap-3">
                            <img
                                src={bestJet.imageUrl}
                                alt={bestJet.title}
                                className="h-14 w-14 rounded-xl object-cover border border-slate-200 dark:border-slate-800"
                                draggable={false}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{bestJet.title}</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                    className="cursor-pointer text-xs rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-3 py-1.5"
                                    onClick={() => openExternal(bestJet.orderUrl)}
                                    title="openExternal"
                                >
                                  Order
                                </button>
                                <button
                                    className="cursor-pointer text-xs rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900"
                                    onClick={() => openDetailsViaChat(bestJet.id)}
                                    title="sendFollowUpMessage → get_jet"
                                >
                                  Open details
                                </button>
                                <button
                                    className="cursor-pointer text-xs rounded-lg bg-sky-600 text-white px-3 py-1.5 disabled:opacity-60"
                                    disabled={favLoading}
                                    onClick={() => saveFavorite(bestJet.id)}
                                    title="fetch: POST /api/favorites"
                                >
                                  {favLoading ? "Saving..." : "Save to favorites"}
                                </button>
                              </div>
                            </div>
                          </div>
                      )}

                      {reasons.length > 0 && (
                          <ul className="mt-4 list-disc pl-5 text-sm text-slate-700 dark:text-slate-200 space-y-1">
                            {reasons.map((r) => (
                                <li key={r}>{r}</li>
                            ))}
                          </ul>
                      )}
                    </div>
                  </section>

                  {/* Table */}
                  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800">
                      <div className="text-sm font-semibold">Comparison table</div>
                    </div>

                    <div className="overflow-auto">
                      <table className="min-w-[720px] w-full text-sm">
                        <thead className="bg-white dark:bg-slate-950">
                        <tr className="border-b border-slate-200 dark:border-slate-800">
                          <th className="text-left px-4 py-3 w-[220px]">Metric</th>
                          {jets.map((j) => {
                            const isBest = j.id === bestPickId;
                            return (
                                <th
                                    key={j.id}
                                    className={[
                                      "text-left px-4 py-3",
                                      isBest ? "bg-sky-50 dark:bg-sky-950/20" : "",
                                    ].join(" ")}
                                >
                                  <div className="flex items-center gap-2">
                                    <img
                                        src={j.imageUrl}
                                        alt={j.title}
                                        className="h-8 w-8 rounded-lg object-cover border border-slate-200 dark:border-slate-800"
                                        draggable={false}
                                    />
                                    <div className="min-w-0">
                                      <div className="font-semibold truncate">{j.title}</div>
                                      <div className="mt-1 flex gap-2">
                                        <button
                                            className="cursor-pointer text-[11px] underline"
                                            onClick={() => openDetailsViaChat(j.id)}
                                            title="sendFollowUpMessage → get_jet"
                                        >
                                          Details
                                        </button>
                                        <button
                                            className="cursor-pointer text-[11px] underline"
                                            onClick={() => openExternal(j.orderUrl)}
                                            title="openExternal"
                                        >
                                          Order
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </th>
                            );
                          })}
                        </tr>
                        </thead>

                        <tbody>
                        {rows.map((row) => (
                            <tr key={row.key} className="border-b border-slate-200 dark:border-slate-800">
                              <td className="px-4 py-3 text-slate-700 dark:text-slate-200">
                                <div className="font-semibold">{row.label}</div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {row.higherIsBetter ? "Higher is better" : "Lower is better"}
                                </div>
                              </td>

                              {jets.map((j) => {
                                const v = row.values[j.id];
                                const isBest = j.id === bestPickId;
                                return (
                                    <td
                                        key={j.id}
                                        className={[
                                          "px-4 py-3",
                                          isBest ? "bg-sky-50 dark:bg-sky-950/20" : "",
                                        ].join(" ")}
                                    >
                                      <span className="font-mono">{fmtValue(row, v)}</span>
                                    </td>
                                );
                              })}
                            </tr>
                        ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
            )}
          </div>
        </div>
      </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-4">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{text}</div>
      </div>
  );
}