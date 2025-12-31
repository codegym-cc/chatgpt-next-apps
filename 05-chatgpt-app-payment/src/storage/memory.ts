import type { CheckoutSession, Order } from "../domain/checkout";

export type InMemoryStore = {
  sessionsById: Map<string, CheckoutSession>;
  idempotencyIndex: Map<string, { fingerprint: string; sessionId: string }>;
  ordersById: Map<string, Order>;
  orderIdBySessionId: Map<string, string>;
};

export function createInMemoryStore(): InMemoryStore {
  return {
    sessionsById: new Map(),
    idempotencyIndex: new Map(),
    ordersById: new Map(),
    orderIdBySessionId: new Map(),
  };
}

function getGlobalStore(): InMemoryStore | undefined {
  return (globalThis as any).__paymentDemoStore as InMemoryStore | undefined;
}

function setGlobalStore(store: InMemoryStore): void {
  (globalThis as any).__paymentDemoStore = store;
}

export const store: InMemoryStore = getGlobalStore() ?? createInMemoryStore();

if (!getGlobalStore()) {
  setGlobalStore(store);
}