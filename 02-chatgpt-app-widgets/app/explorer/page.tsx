"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useCallTool,
  useDisplayMode,
  useIsChatGptApp,
  useMaxHeight,
  useOpenExternal,
  useRequestDisplayMode,
  useSendMessage,
  useWidgetProps,
  useWidgetState,
} from "../hooks";
import type { JetCard, JetDetails } from "@/lib/jets/jets.types";

type ExplorerWidgetState = {
  mode: "list" | "details";
  selectedId: string | null;
  compareIds: string[];
};

const DEFAULT_STATE: ExplorerWidgetState = {
  mode: "list",
  selectedId: null,
  compareIds: [],
};

const EMPTY_TOOL_OUTPUT: any = {};

function asStructured<T>(raw: any): T {
  return raw?.result?.structuredContent ?? raw?.structuredContent ?? raw;
}

function fmtKm(km: number) {
  return `${Math.round(km).toLocaleString()} km`;
}

function fmtUsd(usd: number) {
  const m = usd / 1_000_000;
  return m >= 1 ? `$${Math.round(m)}M` : `$${Math.round(usd).toLocaleString()}`;
}

export default function ExplorerPage() {
  const maxHeight = useMaxHeight() ?? undefined;
  const displayMode = useDisplayMode();
  const requestDisplayMode = useRequestDisplayMode();
  const openExternal = useOpenExternal();
  const sendMessage = useSendMessage();
  const callTool = useCallTool();
  const isChatGptApp = useIsChatGptApp();

  // Important: stable fallback to avoid "new {} every render".
  const toolOutputRaw = useWidgetProps<any>(EMPTY_TOOL_OUTPUT);
  const structured = asStructured<any>(toolOutputRaw);

  const incomingItems = Array.isArray(structured?.items)
      ? (structured.items as JetCard[])
      : null;

  const incomingDetails = structured?.id ? (structured as JetDetails) : null;

  // Use a signature string so we react only to meaningful tool output changes,
  // not to object identity changes coming from host updates.
  const toolKey = incomingDetails?.id
      ? `details:${incomingDetails.id}`
      : incomingItems
          ? `items:${incomingItems.map((x) => x.id).join("|")}`
          : "none";

  const [widgetState, setWidgetState] = useWidgetState<ExplorerWidgetState>(() => ({
    mode: "list",
    selectedId: null,
    compareIds: [],
  }));
  const state = widgetState ?? DEFAULT_STATE;

  const [items, setItems] = useState<JetCard[] | null>(incomingItems);
  const [details, setDetails] = useState<JetDetails | null>(incomingDetails);

  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [favorites, setFavorites] = useState<string[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);
  const [favSavingId, setFavSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (incomingItems) {
      setItems(incomingItems);
      setDetails(null);
      setDetailsError(null);
      setDetailsLoading(false);

      // Only reset to list when the *tool output* changed to a new list.
      // (User-driven details via callTool should not be overridden.)
      if (state.mode !== "list" || state.selectedId !== null) {
        setWidgetState((prev) => ({
          ...(prev ?? DEFAULT_STATE),
          mode: "list",
          selectedId: null,
        }));
      }
      return;
    }

    if (incomingDetails) {
      setDetails(incomingDetails);
      setDetailsError(null);
      setDetailsLoading(false);

      if (state.mode !== "details" || state.selectedId !== incomingDetails.id) {
        setWidgetState((prev) => ({
          ...(prev ?? DEFAULT_STATE),
          mode: "details",
          selectedId: incomingDetails.id,
        }));
      }
    }

    // Intentionally depend only on toolKey:
    // we don't want this sync effect to react to widgetState changes (e.g. user clicks "Details").
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolKey]);

  const compareSet = useMemo(() => new Set(state.compareIds), [state.compareIds]);

  function toggleCompare(id: string) {
    setWidgetState((prev) => {
      const s = prev ?? DEFAULT_STATE;
      const exists = s.compareIds.includes(id);
      const next = exists
          ? s.compareIds.filter((x) => x !== id)
          : [...s.compareIds, id].slice(0, 5);
      return { ...s, compareIds: next };
    });
  }

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
    setFavSavingId(jetId);
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
      setFavSavingId(null);
    }
  }

  async function openDetails(id: string) {
    if (state.mode !== "details" || state.selectedId !== id) {
      setWidgetState((prev) => ({
        ...(prev ?? DEFAULT_STATE),
        mode: "details",
        selectedId: id,
      }));
    }

    setDetailsLoading(true);
    setDetailsError(null);

    try {
      const res = await callTool("get_jet", { id });
      if (!res) throw new Error("callTool is not available (open inside ChatGPT App).");

      const details = (res as any).structuredContent;
      if (!details?.id) throw new Error("Unexpected tool result.");

      setDetails(details as JetDetails);
    } catch (e) {
      setDetailsError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetailsLoading(false);
    }
  }

  async function startCompare() {
    const ids = state.compareIds;
    if (ids.length < 2) return;

    const prompt = `Compare these private jets using tool compare_jets: ${JSON.stringify({ ids })}. MUST call tool compare_jets.`;
    await sendMessage(prompt);
  }

  const isFullscreen = displayMode === "fullscreen";
  const showList = state.mode === "list";
  const showDetails = state.mode === "details";

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
              <div className="text-sm font-semibold truncate">Private Jet Explorer</div>
              <div className="text-xs text-slate-600 dark:text-slate-300 truncate">
                List → Details (tool-call) → Compare (follow-up)
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
                Tip: open this widget from ChatGPT (Dev Mode) to get toolOutput + callTool.
              </div>
          )}

          {favError && (
              <div className="px-4 py-2 text-xs text-red-700 dark:text-red-300 border-b border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30">
                Favorites error: {favError}
              </div>
          )}

          {/* Body */}
          <div className="flex-1 overflow-hidden p-4">
            {showList && (
                <section className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-0">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                    <div className="text-sm font-semibold">Jets</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      Selected for compare: {state.compareIds.length}/5
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto p-3">
                    {!items ? (
                        <EmptyState
                            title="No results yet"
                            text='Ask the assistant: "Show 5 private jets" (it will call search_jet).'
                        />
                    ) : items.length === 0 ? (
                        <EmptyState title="Empty" text="No jets match the current search." />
                    ) : (
                        <div className="space-y-3">
                          {items.map((jet) => {
                            const selected = state.selectedId === jet.id;
                            const inCompare = compareSet.has(jet.id);

                            return (
                                <div
                                    key={jet.id}
                                    className={[
                                      "rounded-xl border p-3",
                                      selected
                                          ? "border-sky-400 dark:border-sky-700 bg-sky-50/60 dark:bg-sky-950/20"
                                          : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950",
                                    ].join(" ")}
                                >
                                  <div className="flex gap-3">
                                    <img
                                        src={jet.imageUrl}
                                        alt={jet.title}
                                        className="h-14 w-14 rounded-lg object-cover border border-slate-200 dark:border-slate-800 flex-shrink-0"
                                        draggable={false}
                                    />

                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                          <div className="text-sm font-semibold truncate">{jet.title}</div>
                                          <div className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                                            {jet.summary}
                                          </div>
                                        </div>

                                        <div className="flex flex-col items-end text-[11px] text-slate-600 dark:text-slate-300">
                                          <div>Range: {fmtKm(jet.rangeKm)}</div>
                                          <div>Seats: {jet.seats}</div>
                                          <div>~ {fmtUsd(jet.priceEstimateUsd)}</div>
                                        </div>
                                      </div>

                                      <div className="mt-2 flex flex-wrap gap-1">
                                        {jet.tags.slice(0, 4).map((t) => (
                                            <span
                                                key={t}
                                                className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                                            >
                                    {t}
                                  </span>
                                        ))}
                                      </div>

                                      <div className="mt-3 flex gap-2">
                                        <button
                                            className="cursor-pointer text-xs rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-3 py-1.5"
                                            onClick={() => openDetails(jet.id)}
                                            title='tool-call: get_jet({id})'
                                        >
                                          Details
                                        </button>

                                        <button
                                            className="cursor-pointer text-xs rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-900"
                                            onClick={() => toggleCompare(jet.id)}
                                        >
                                          {inCompare ? "Remove from compare" : "Add to compare"}
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                            );
                          })}
                        </div>
                    )}
                  </div>

                  <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
                    <button
                        className="cursor-pointer w-full text-sm rounded-xl bg-sky-600 text-white px-4 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={state.compareIds.length < 2}
                        onClick={startCompare}
                        title="sendFollowUpMessage → compare_jets"
                    >
                      Compare ({state.compareIds.length})
                    </button>

                    {state.compareIds.length > 0 && (
                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                          ids: <code className="font-mono">{JSON.stringify(state.compareIds)}</code>
                        </div>
                    )}
                  </div>
                </section>
            )}

            {showDetails && (
                <section className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col min-h-0">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold">Details</div>
                    <button
                        className="cursor-pointer text-xs rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-900"
                        onClick={() => setWidgetState((prev) => ({ ...(prev ?? DEFAULT_STATE), mode: "list" }))}
                    >
                      Back
                    </button>
                  </div>

                  <div className="flex-1 overflow-auto p-4">
                    {detailsLoading ? (
                        <LoadingState title="Loading details..." />
                    ) : detailsError ? (
                        <ErrorState
                            title="Failed to load details"
                            text={detailsError}
                            onRetry={() => (state.selectedId ? openDetails(state.selectedId) : null)}
                        />
                    ) : !details ? (
                        <EmptyState title="No jet selected" text="Pick a jet from the list to view details." />
                    ) : (
                        <div className="space-y-4">
                          <div className="flex gap-3">
                            <img
                                src={details.imageUrl}
                                alt={details.title}
                                className="h-20 w-20 rounded-xl object-cover border border-slate-200 dark:border-slate-800 flex-shrink-0"
                                draggable={false}
                            />

                            <div className="min-w-0 flex-1">
                              <div className="text-lg font-semibold leading-tight">{details.title}</div>
                              <div className="text-xs text-slate-600 dark:text-slate-300">
                                {details.manufacturer} • {details.category}
                              </div>

                              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-700 dark:text-slate-200">
                                <Stat label="Range" value={fmtKm(details.rangeKm)} />
                                <Stat label="Seats" value={`${details.seats}`} />
                                <Stat label="Speed" value={`${details.speedKmh} km/h`} />
                                <Stat label="Price" value={fmtUsd(details.priceEstimateUsd)} />
                              </div>
                            </div>
                          </div>

                          <div className="text-sm text-slate-700 dark:text-slate-200">{details.description}</div>

                          <div className="flex flex-wrap gap-1">
                            {details.tags.map((t) => (
                                <span
                                    key={t}
                                    className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                                >
                          {t}
                        </span>
                            ))}
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                className="cursor-pointer text-sm rounded-xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-4 py-2"
                                onClick={() => openExternal(details.orderUrl)}
                                title="openExternal"
                            >
                              Order / Request quote
                            </button>

                            <button
                                className="cursor-pointer text-sm rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-900"
                                onClick={() => openExternal(details.docsUrl)}
                                title="openExternal"
                            >
                              Docs
                            </button>

                            <button
                                className="cursor-pointer text-sm rounded-xl bg-sky-600 text-white px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
                                onClick={() => saveFavorite(details.id)}
                                disabled={favSavingId === details.id}
                                title="fetch: POST /api/favorites"
                            >
                              {favSavingId === details.id ? "Saving..." : "Save to favorites"}
                            </button>
                          </div>

                          <div className="text-xs text-slate-600 dark:text-slate-300">
                            Demo notes: details are loaded via <code className="font-mono">callTool("get_jet")</code>,
                            favorites via <code className="font-mono">fetch("/api/favorites")</code>.
                          </div>
                        </div>
                    )}
                  </div>
                </section>
            )}
          </div>
        </div>
      </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/40 px-3 py-2">
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
        <div className="font-semibold">{value}</div>
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

function LoadingState({ title }: { title: string }) {
  return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 bg-slate-50 dark:bg-slate-900/30">
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-2 text-xs text-slate-600 dark:text-slate-300">Please wait…</div>
      </div>
  );
}

function ErrorState({
                      title,
                      text,
                      onRetry,
                    }: {
  title: string;
  text: string;
  onRetry: (() => void) | null;
}) {
  return (
      <div className="rounded-xl border border-red-200 dark:border-red-900 p-4 bg-red-50 dark:bg-red-950/20">
        <div className="text-sm font-semibold text-red-900 dark:text-red-200">{title}</div>
        <div className="mt-1 text-xs text-red-800 dark:text-red-200">{text}</div>
        {onRetry && (
            <button
                className="mt-3 cursor-pointer text-xs rounded-lg bg-red-600 text-white px-3 py-1.5"
                onClick={onRetry}
            >
              Retry
            </button>
        )}
      </div>
  );
}