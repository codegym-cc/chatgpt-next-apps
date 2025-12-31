"use client";

import { useEffect, useState } from "react";

type SessionLineItem = {
  sku: string;
  title: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
};

type SessionSummary = {
  id: string;
  status: "created" | "confirmed" | "expired";
  currency: "USD";
  total: number;
  lineItems: SessionLineItem[];
  orderId: string | null;
};

type ConfirmResponse = {
  orderId: string;
  status: "confirmed";
  checkoutSessionId: string;
};

function formatUsd(amount: number) {
  return `$${amount}`;
}

import { useParams } from "next/navigation";

export default function HostedCheckoutPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  console.log(sessionId);

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionSummary | null>(null);
  const [paying, setPaying] = useState(false);
  const [order, setOrder] = useState<ConfirmResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/checkout/sessions/${encodeURIComponent(sessionId)}`, {
        cache: "no-store"
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = body?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const data = (await res.json()) as SessionSummary;
      setSession(data);

      if (data.orderId) {
        setOrder({ orderId: data.orderId, status: "confirmed", checkoutSessionId: data.id });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function onPayDemo() {
    if (paying) return;
    setPaying(true);
    setError(null);

    try {
      const res = await fetch(`/api/checkout/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId: sessionId })
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error?.message ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setOrder(body as ConfirmResponse);
      await load(); // refresh summary
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Hosted Checkout (Demo)</h1>
        <p className="mt-1 text-sm text-slate-600">
          This page simulates a merchant-hosted checkout. No real charges are made.
        </p>

        {loading && <p className="mt-4 text-sm text-slate-600">Loading session…</p>}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {session && (
          <div className="mt-5 rounded-2xl border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm text-slate-600">Session</div>
                <div className="font-mono text-xs">{session.id}</div>
              </div>
              <div className="text-right">
                <div className="text-sm text-slate-600">Status</div>
                <div className="text-sm font-semibold">{session.status}</div>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <h2 className="text-sm font-semibold">Items</h2>

              <div className="mt-3 space-y-3">
                {session.lineItems.map((li) => (
                  <div key={li.sku} className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{li.title}</div>
                      <div className="text-xs text-slate-500">
                        {li.sku} · {li.quantity} × {formatUsd(li.unitPrice)}
                      </div>
                    </div>
                    <div className="text-sm font-semibold">{formatUsd(li.lineTotal)}</div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <span className="text-sm text-slate-600">Total</span>
                <span className="text-lg font-semibold">{formatUsd(session.total)}</span>
              </div>

              {!order && (
                <button
                  type="button"
                  onClick={onPayDemo}
                  disabled={paying || session.status === "expired"}
                  className="mt-4 w-full cursor-pointer rounded-xl bg-emerald-600 text-white px-4 py-2.5 text-sm font-semibold hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {paying ? "Processing…" : "Pay (demo)"}
                </button>
              )}

              {order && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <div className="font-semibold">Order confirmed</div>
                  <div className="mt-1">
                    orderId: <span className="font-mono text-xs">{order.orderId}</span>
                  </div>
                  <div className="mt-2 text-xs text-emerald-900/70">
                    You can close this tab and return to ChatGPT. Repeated Pay is safe (idempotent confirm).
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-slate-500">
          Debug tip: if you refresh this page after confirming, the order stays confirmed (idempotent).
        </p>
      </div>
    </div>
  );
}