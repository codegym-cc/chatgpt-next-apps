"use client";

import {useEffect, useMemo, useState} from "react";
import {
    useCallTool,
    useDisplayMode,
    useIsChatGptApp,
    useMaxHeight,
    useOpenExternal,
    useRequestDisplayMode,
    useWidgetState,
} from "./hooks";

type Currency = "USD";

type CatalogItem = {
    sku: string;
    title: string;
    price: number;
    currency: Currency;
    imageUrl?: string;
    inStock: boolean;
};

type CartItem = { sku: string; quantity: number };

type PendingCheckout = {
    idempotencyKey: string;
    cartFingerprint: string;
};

type WidgetState = {
    cart: { items: CartItem[] };
    pendingCheckout: PendingCheckout | null;
};

type UiState =
    | "loadingProducts"
    | "idle"
    | "creatingSession"
    | "openingCheckout"
    | "awaitingExternal"
    | "success"
    | "error";

type StatusKind = "info" | "success" | "error";

type CreateSessionResult = {
    checkoutSessionId: string;
    status: "created";
    currency: "USD";
    total: number;
    checkoutUrl: string;
    lineItems: Array<{ sku: string; quantity: number }>;
    requestCheckoutPayload: Record<string, unknown>;
};

type ProductFeedResponse = {
    items: Array<{
        id: string;
        title: string;
        price: number;
        currency: "USD";
        imageUrl?: string;
        availability: "in_stock" | "out_of_stock";
        url: string;
    }>;
};

type ActiveTab = "catalog" | "cart";

function formatUsd(amount: number) {
    return `$${amount}`;
}

function normalizeCart(items: CartItem[]): CartItem[] {
    const bySku = new Map<string, number>();
    for (const it of items) {
        bySku.set(it.sku, (bySku.get(it.sku) ?? 0) + it.quantity);
    }
    const normalized = Array.from(bySku.entries()).map(([sku, quantity]) => ({sku, quantity}));
    normalized.sort((a, b) => a.sku.localeCompare(b.sku));
    return normalized;
}

function fingerprintCart(items: CartItem[]): string {
    const normalized = normalizeCart(items);
    return JSON.stringify({currency: "USD", items: normalized});
}

function randomUUID(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

async function parseToolResultJson<T>(raw: unknown): Promise<T> {
    // callTool implementations differ between host + local dev.
    if (raw && typeof raw === "object" && "structuredContent" in (raw as Record<string, unknown>)) {
        return parseToolResultJson<T>((raw as any).structuredContent);
    }
    if (typeof raw === "string") {
        return JSON.parse(raw) as T;
    }
    return raw as T;
}

function statusClasses(kind: StatusKind) {
    switch (kind) {
        case "error":
            return "border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200";
        case "success":
            return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";
        default:
            return "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200";
    }
}

export default function ShopWidget() {
    const maxHeight = useMaxHeight();
    const displayMode = useDisplayMode() ?? "inline";
    const requestDisplayMode = useRequestDisplayMode();

    const isChatGptApp = useIsChatGptApp();
    const openExternal = useOpenExternal();
    const callTool = useCallTool();

    const [activeTab, setActiveTab] = useState<ActiveTab>("catalog");

    const [widgetState, setWidgetState] = useWidgetState<WidgetState>({
        cart: {items: []},
        pendingCheckout: null,
    });

    const cartItems = widgetState?.cart.items ?? [];

    const [products, setProducts] = useState<CatalogItem[]>([]);
    const [uiState, setUiState] = useState<UiState>("loadingProducts");
    const [status, setStatus] = useState<{ kind: StatusKind; text: string } | null>(null);

    const productsBySku = useMemo(() => {
        const map = new Map<string, CatalogItem>();
        for (const p of products) map.set(p.sku, p);
        return map;
    }, [products]);

    const cartQuantity = useMemo(() => cartItems.reduce((sum, it) => sum + it.quantity, 0), [cartItems]);

    const cartTotal = useMemo(() => {
        let total = 0;
        for (const item of cartItems) {
            const product = productsBySku.get(item.sku);
            if (!product) continue;
            total += product.price * item.quantity;
        }
        return total;
    }, [cartItems, productsBySku]);

    // Make the widget ~2x smaller in inline/pip, full height in fullscreen.
    const widgetHeightPx = useMemo(() => {
        const mh = maxHeight ?? 700;
        if (displayMode === "fullscreen") return mh;

        // ~70% height (clamped for usability)
        const half = Math.round(mh * 0.7);
        return Math.max(260, Math.min(half, 720));
    }, [maxHeight, displayMode]);

    useEffect(() => {
        let cancelled = false;

        async function loadProducts() {
            setUiState("loadingProducts");
            setStatus({kind: "info", text: "Loading products…"});

            try {
                // Preferred path inside ChatGPT: use MCP tool store_list_products
                const res = await callTool("store_list_products", {limit: 20});
                if (res) {
                    const data = await parseToolResultJson<{ items: CatalogItem[] }>(res);
                    if (!cancelled) {
                        setProducts(data.items);
                        setUiState("idle");
                        setStatus(null);
                    }
                    return;
                }

                // Local dev fallback: load from public feed endpoint (read-only)
                const feedRes = await fetch("/product-feed.json", {cache: "no-store"});
                if (!feedRes.ok) throw new Error(`HTTP ${feedRes.status}`);

                const feed = (await feedRes.json()) as ProductFeedResponse;
                const mapped: CatalogItem[] = feed.items.map((it) => ({
                    sku: it.id,
                    title: it.title,
                    price: it.price,
                    currency: it.currency,
                    imageUrl: it.imageUrl,
                    inStock: it.availability === "in_stock",
                }));

                if (!cancelled) {
                    setProducts(mapped);
                    setUiState("idle");
                    setStatus({
                        kind: "info",
                        text: "Running outside ChatGPT: products loaded from /product-feed.json. Checkout buttons require ChatGPT runtime.",
                    });
                }
            } catch (e) {
                if (!cancelled) {
                    setUiState("error");
                    setStatus({kind: "error", text: e instanceof Error ? e.message : String(e)});
                }
            }
        }

        void loadProducts();
        return () => {
            cancelled = true;
        };
    }, [callTool]);

    function updateCart(updater: (items: CartItem[]) => CartItem[]) {
        setWidgetState((prev) => {
            const currentItems = prev?.cart.items ?? [];
            const nextItems = updater(currentItems);

            // Per PRD: if cart changes, reset pendingCheckout to avoid idempotency conflicts.
            return {
                cart: {items: nextItems},
                pendingCheckout: null,
            };
        });
    }

    function addToCart(sku: string) {
        updateCart((items) => {
            const next = [...items];
            const idx = next.findIndex((x) => x.sku === sku);
            if (idx >= 0) {
                const q = Math.min(10, next[idx].quantity + 1);
                next[idx] = {sku, quantity: q};
            } else {
                next.push({sku, quantity: 1});
            }
            return next;
        });
    }

    function decFromCart(sku: string) {
        updateCart((items) => {
            const next: CartItem[] = [];
            for (const it of items) {
                if (it.sku !== sku) {
                    next.push(it);
                    continue;
                }
                const q = it.quantity - 1;
                if (q >= 1) next.push({sku, quantity: q});
            }
            return next;
        });
    }

    function removeFromCart(sku: string) {
        updateCart((items) => items.filter((x) => x.sku !== sku));
    }

    function ensureIdempotencyKey(): string {
        const fp = fingerprintCart(cartItems);
        const existing = widgetState?.pendingCheckout;

        if (existing && existing.cartFingerprint === fp) {
            return existing.idempotencyKey;
        }

        const idempotencyKey = randomUUID();
        setWidgetState((prev) => ({
            cart: prev?.cart ?? {items: cartItems},
            pendingCheckout: {idempotencyKey, cartFingerprint: fp},
        }));
        return idempotencyKey;
    }

    async function createCheckoutSession(): Promise<CreateSessionResult> {
        const idempotencyKey = ensureIdempotencyKey();
        const lineItems = cartItems.map((it) => ({sku: it.sku, quantity: it.quantity}));

        const res = await callTool("checkout_create_session", {lineItems, idempotencyKey});
        if (!res) throw new Error("callTool unavailable (open this widget inside ChatGPT App)");

        return await parseToolResultJson<CreateSessionResult>(res);
    }

    async function onLinkOut() {
        if (cartItems.length === 0) return;

        setUiState("creatingSession");
        setStatus({kind: "info", text: "Creating checkout session…"});

        try {
            const session = await createCheckoutSession();
            setUiState("awaitingExternal");
            setStatus({kind: "info", text: "Opening hosted checkout…"});
            openExternal(session.checkoutUrl);
        } catch (e) {
            setUiState("error");
            setStatus({kind: "error", text: e instanceof Error ? e.message : String(e)});
        }
    }

    async function onBuy() {
        if (cartItems.length === 0) return;

        setUiState("creatingSession");
        setStatus({kind: "info", text: "Creating checkout session…"});

        try {
            const session = await createCheckoutSession();
            setUiState("openingCheckout");

            // Feature detection + fallback
            const canRequestCheckout =
                typeof window !== "undefined" && typeof window.openai?.requestCheckout === "function";

            if (canRequestCheckout) {
                try {
                    await (window.openai as any).requestCheckout(session.requestCheckoutPayload);
                    // In real Instant Checkout the host would call complete_checkout for you.
                    // In this demo, we just show "success" if requestCheckout resolves.
                    setUiState("success");
                    setStatus({kind: "success", text: "Checkout completed in chat (demo). No real charge was made."});
                    return;
                } catch {
                    setStatus({kind: "info", text: "requestCheckout failed → fallback to hosted checkout"});
                }
            } else {
                setStatus({kind: "info", text: "requestCheckout unavailable → fallback to hosted checkout"});
            }

            setUiState("awaitingExternal");
            openExternal(session.checkoutUrl);
        } catch (e) {
            setUiState("error");
            setStatus({kind: "error", text: e instanceof Error ? e.message : String(e)});
        }
    }

    const checkoutDisabled =
        cartItems.length === 0 || uiState === "creatingSession" || uiState === "openingCheckout";

    return (
        <div
            className="font-sans w-full bg-white dark:bg-slate-950 overflow-hidden relative"
            style={{height: widgetHeightPx}}
        >
            {/* Hide scrollbars visually but keep scroll behavior */}
            <style jsx global>{`
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }

                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>

            {displayMode !== "fullscreen" && (
                <button
                    aria-label="Enter fullscreen"
                    className="fixed top-3 right-3 z-50 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 shadow-lg ring-1 ring-slate-900/10 dark:ring-white/10 p-2 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    onClick={() => requestDisplayMode("fullscreen")}
                >
                    <svg
                        className="w-5 h-5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
                        />
                    </svg>
                </button>
            )}

            <div className="h-full w-full p-3">
                <div
                    className="h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div
                                    className="text-sm font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                                    Payment Demo
                                </div>
                                <div className="text-xs text-slate-600 dark:text-slate-300">
                                    No real charges · {isChatGptApp ? "ChatGPT runtime" : "Browser"}
                                </div>
                            </div>

                            <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                                <div>
                                    Cart: <span
                                    className="font-semibold text-slate-700 dark:text-slate-200">{cartQuantity}</span>
                                </div>
                                <div>
                                    Total:{" "}
                                    <span
                                        className="font-semibold text-slate-700 dark:text-slate-200">{formatUsd(cartTotal)}</span>
                                </div>
                            </div>
                        </div>

                        {status && (
                            <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${statusClasses(status.kind)}`}>
                                {status.text}
                            </div>
                        )}

                        {/* Tabs */}
                        <div className="mt-2 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setActiveTab("catalog")}
                                className={[
                                    "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer",
                                    activeTab === "catalog"
                                        ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
                                        : "border-transparent bg-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/20",
                                ].join(" ")}
                            >
                                Catalog
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("cart")}
                                className={[
                                    "px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer",
                                    activeTab === "cart"
                                        ? "border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-100"
                                        : "border-transparent bg-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900/20",
                                ].join(" ")}
                            >
                                Cart ({cartQuantity})
                            </button>

                            <div className="ml-auto text-[11px] text-slate-500 dark:text-slate-400 self-center">
                                state: <span className="font-semibold">{uiState}</span>
                            </div>
                        </div>
                    </div>

                    {/* Main (scrollable but no visible scrollbar) */}
                    <div className="flex-1 overflow-hidden">
                        <div className="h-full overflow-y-auto no-scrollbar px-3 py-2">
                            {activeTab === "catalog" && (
                                <>
                                    {uiState === "loadingProducts" && (
                                        <div className="text-xs text-slate-600 dark:text-slate-300">Loading…</div>
                                    )}

                                    {products.map((p) => (
                                        <div
                                            key={p.sku}
                                            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 mb-2"
                                        >
                                            <div className="min-w-0">
                                                <div
                                                    className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                                    {p.title}
                                                </div>
                                                <div
                                                    className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                                    {p.sku} · {p.inStock ? "In stock" : "Out of stock"}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <div
                                                    className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                    {formatUsd(p.price)}
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={!p.inStock}
                                                    onClick={() => addToCart(p.sku)}
                                                    className="cursor-pointer rounded-lg bg-sky-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-sky-700 disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    Add
                                                </button>
                                            </div>
                                        </div>
                                    ))}

                                    <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                                        Prices are authoritative server-side; widget sends only SKU + quantity.
                                    </div>
                                </>
                            )}

                            {activeTab === "cart" && (
                                <>
                                    {cartItems.length === 0 && (
                                        <div className="text-sm text-slate-600 dark:text-slate-300">Your cart is
                                            empty.</div>
                                    )}

                                    {cartItems.map((it) => {
                                        const product = productsBySku.get(it.sku);
                                        return (
                                            <div
                                                key={it.sku}
                                                className="rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 mb-2"
                                            >
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div
                                                            className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                                                            {product?.title ?? it.sku}
                                                        </div>
                                                        <div
                                                            className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{it.sku}</div>
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={() => removeFromCart(it.sku)}
                                                        className="text-[11px] text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white cursor-pointer"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>

                                                <div className="mt-2 flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => decFromCart(it.sku)}
                                                            className="cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm"
                                                        >
                                                            –
                                                        </button>

                                                        <span
                                                            className="text-sm font-semibold text-slate-900 dark:text-slate-100 w-6 text-center">
                              {it.quantity}
                            </span>

                                                        <button
                                                            type="button"
                                                            onClick={() => addToCart(it.sku)}
                                                            className="cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700 px-2 py-1 text-sm"
                                                        >
                                                            +
                                                        </button>
                                                    </div>

                                                    <div
                                                        className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                                        {product ? formatUsd(product.price * it.quantity) : "—"}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {uiState === "awaitingExternal" && (
                                        <div className="mt-2 text-[11px] text-slate-600 dark:text-slate-300">
                                            If a tab opened, complete “Pay (demo)” there. Repeated Pay is safe
                                            (idempotent confirm).
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Footer (always visible, no scrolling) */}
                    <div
                        className="px-3 py-2 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                disabled={checkoutDisabled}
                                onClick={onBuy}
                                className="cursor-pointer rounded-xl bg-emerald-600 text-white px-3 py-2 text-xs font-semibold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                Buy (try in chat)
                            </button>

                            <button
                                type="button"
                                disabled={checkoutDisabled}
                                onClick={onLinkOut}
                                className="cursor-pointer rounded-xl border border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-950/30 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-white dark:hover:bg-slate-950/50 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                Link out
                            </button>
                        </div>

                        {!isChatGptApp && (
                            <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                                Tip: checkout buttons require ChatGPT App runtime (window.openai.callTool).
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}