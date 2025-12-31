import { baseURL } from "../../baseUrl";
import type { CatalogService, Currency } from "./catalog";
import { catalogService } from "./catalog";
import type { InMemoryStore } from "../storage/memory";
import { store } from "../storage/memory";

export type CartItem = { sku: string; quantity: number };
export type CartState = { items: CartItem[] };

export type CheckoutStatus = "created" | "confirmed" | "expired";

export type CheckoutSession = {
  id: string; // "cs_..."
  createdAt: string; // ISO
  status: CheckoutStatus;

  idempotencyKey: string;

  lineItems: Array<{
    sku: string;
    title: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;

  total: number;
  currency: Currency;

  checkoutUrl: string; // absolute
  orderId?: string;
};

export type Order = {
  id: string; // "o_..."
  checkoutSessionId: string;
  status: "confirmed";
  createdAt: string;
};

export type CheckoutErrorCode =
  | "OUT_OF_STOCK"
  | "IDEMPOTENCY_CONFLICT"
  | "SESSION_NOT_FOUND"
  | "SESSION_EXPIRED"
  | "INTERNAL_ERROR";

export class CheckoutError extends Error {
  readonly code: CheckoutErrorCode;
  constructor(code: CheckoutErrorCode, message: string) {
    super(message);
    this.name = "CheckoutError";
    this.code = code;
  }
}

export class OutOfStockError extends CheckoutError {
  readonly sku: string;
  constructor(sku: string) {
    super("OUT_OF_STOCK", `Product out of stock: ${sku}`);
    this.name = "OutOfStockError";
    this.sku = sku;
  }
}

export class IdempotencyConflictError extends CheckoutError {
  constructor() {
    super("IDEMPOTENCY_CONFLICT", "Idempotency conflict: same key with different items");
    this.name = "IdempotencyConflictError";
  }
}

export class SessionNotFoundError extends CheckoutError {
  readonly checkoutSessionId: string;
  constructor(checkoutSessionId: string) {
    super("SESSION_NOT_FOUND", `Checkout session not found: ${checkoutSessionId}`);
    this.name = "SessionNotFoundError";
    this.checkoutSessionId = checkoutSessionId;
  }
}

export class SessionExpiredError extends CheckoutError {
  readonly checkoutSessionId: string;
  constructor(checkoutSessionId: string) {
    super("SESSION_EXPIRED", `Checkout session expired: ${checkoutSessionId}`);
    this.name = "SessionExpiredError";
    this.checkoutSessionId = checkoutSessionId;
  }
}

function generateUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

export function normalizeLineItems(items: CartItem[]): CartItem[] {
  const bySku = new Map<string, number>();

  for (const item of items) {
    const prev = bySku.get(item.sku) ?? 0;
    bySku.set(item.sku, prev + item.quantity);
  }

  const normalized = Array.from(bySku.entries()).map(([sku, quantity]) => ({ sku, quantity }));
  normalized.sort((a, b) => a.sku.localeCompare(b.sku));
  return normalized;
}

export function createFingerprint(items: CartItem[]): string {
  const normalized = normalizeLineItems(items);
  return JSON.stringify({ currency: "USD" as const, items: normalized });
}

function absoluteCheckoutUrl(sessionId: string, appBaseUrl: string): string {
  return new URL(`/checkout/${sessionId}`, appBaseUrl).toString();
}

function logEvent(event: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...data }));
}

export class CheckoutService {
  constructor(
    private readonly deps: {
      store: InMemoryStore;
      catalog: CatalogService;
      appBaseUrl?: string;
    }
  ) {}

  private get appBaseUrl(): string {
    return this.deps.appBaseUrl ?? baseURL;
  }

  public getSession(checkoutSessionId: string): CheckoutSession {
    const session = this.deps.store.sessionsById.get(checkoutSessionId);
    if (!session) throw new SessionNotFoundError(checkoutSessionId);
    return session;
  }

  public createSession(input: { lineItems: CartItem[]; idempotencyKey: string }): CheckoutSession {
    const normalizedItems = normalizeLineItems(input.lineItems);
    const fingerprint = createFingerprint(normalizedItems);

    const existing = this.deps.store.idempotencyIndex.get(input.idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        logEvent("checkout_session_idempotency_conflict", { idempotencyKey: input.idempotencyKey });
        throw new IdempotencyConflictError();
      }

      const hit = this.deps.store.sessionsById.get(existing.sessionId);
      if (!hit) {
        throw new CheckoutError("INTERNAL_ERROR", "Idempotency index is corrupted (missing session)");
      }

      logEvent("checkout_session_idempotent_hit", {
        sessionId: hit.id,
        idempotencyKey: input.idempotencyKey
      });
      return hit;
    }

    const lineItemsSnapshot: CheckoutSession["lineItems"] = normalizedItems.map(({ sku, quantity }) => {
      const product = this.deps.catalog.requireBySku(sku);

      if (!product.inStock) {
        throw new OutOfStockError(sku);
      }

      const unitPrice = product.price;
      const lineTotal = unitPrice * quantity;

      return {
        sku,
        title: product.title,
        unitPrice,
        quantity,
        lineTotal
      };
    });

    const total = lineItemsSnapshot.reduce((sum, li) => sum + li.lineTotal, 0);

    const sessionId = `cs_${generateUuid()}`;
    const session: CheckoutSession = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      status: "created",
      idempotencyKey: input.idempotencyKey,
      lineItems: lineItemsSnapshot,
      total,
      currency: "USD",
      checkoutUrl: absoluteCheckoutUrl(sessionId, this.appBaseUrl)
    };

    this.deps.store.sessionsById.set(sessionId, session);
    this.deps.store.idempotencyIndex.set(input.idempotencyKey, { fingerprint, sessionId });

    logEvent("checkout_session_created", {
      sessionId,
      total,
      idempotencyKey: input.idempotencyKey
    });

    return session;
  }

  public confirm(checkoutSessionId: string): {
    orderId: string;
    status: "confirmed";
    checkoutSessionId: string;
  } {
    const session = this.deps.store.sessionsById.get(checkoutSessionId);
    if (!session) throw new SessionNotFoundError(checkoutSessionId);

    if (session.status === "expired") {
      throw new SessionExpiredError(checkoutSessionId);
    }

    if (session.status === "confirmed") {
      const existing = session.orderId ?? this.deps.store.orderIdBySessionId.get(checkoutSessionId);
      if (!existing) {
        throw new CheckoutError("INTERNAL_ERROR", "Session is confirmed but orderId is missing");
      }
      return { orderId: existing, status: "confirmed", checkoutSessionId };
    }

    const orderId = `o_${generateUuid()}`;
    const order: Order = {
      id: orderId,
      checkoutSessionId,
      status: "confirmed",
      createdAt: new Date().toISOString()
    };

    session.status = "confirmed";
    session.orderId = orderId;

    this.deps.store.ordersById.set(orderId, order);
    this.deps.store.orderIdBySessionId.set(checkoutSessionId, orderId);

    logEvent("checkout_confirmed", { sessionId: checkoutSessionId, orderId });

    return { orderId, status: "confirmed", checkoutSessionId };
  }

  public buildRequestCheckoutPayload(session: CheckoutSession): Record<string, unknown> {
    const line_items = session.lineItems.map((li) => {
      const base = li.unitPrice * li.quantity*100; //in cents
      return {
        id: `li_${li.sku}`,
        item: {
          id: li.sku,
          quantity: li.quantity
        },
        base_amount: base,
        discount: 0,
        subtotal: base,
        tax: 0,
        total: base
      };
    });

    return {
      id: session.id,
      payment_provider: {
        provider: "demo",
        merchant_id: "demo-merchant",
        supported_payment_methods: ["card"]
      },
      status: "ready_for_payment",
      currency: session.currency,
      line_items,
      totals: [{ type: "total", display_text: "Total", amount: session.total*100 }], //in cents
      messages: [],
      links: [
        { type: "terms_of_use", url: "https://example.com/terms" },
        { type: "privacy_policy", url: "https://example.com/privacy" },
        { type: "refund_policy", url: "https://example.com/refunds" }
      ],
      payment_mode: "test",
      metadata: {
        checkoutSessionId: session.id,
        checkoutUrl: session.checkoutUrl
      }
    };
  }
}

export const checkoutService = new CheckoutService({
  store,
  catalog: catalogService,
  appBaseUrl: baseURL
});

// Re-export catalog error for tool/router layers that want a single import.
export { ProductNotFoundError } from "./catalog";