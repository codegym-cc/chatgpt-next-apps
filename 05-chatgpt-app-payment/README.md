# ChatGPT App — Payment Demo (Next.js 16 + React 19)

A small **reference / demo ChatGPT App** that simulates a **checkout flow**:

- Browse a product catalog
- Add items to a cart
- Create a checkout session (idempotent)
- Try **in-chat checkout** (when running inside the ChatGPT App host)
- Fallback to a **hosted checkout page** in the browser
- Confirm the checkout (idempotent) and get an `orderId`

> Important: **No real payments are processed.** This repo intentionally uses a fake “Pay (demo)” confirmation and an in-memory store.


## What this demo is for

This project is meant to be a **learning-friendly template** for:

- Building a **Next.js App Router** UI that can run:
    - inside the ChatGPT Apps runtime (via `window.openai.*`), and
    - in a normal browser (with graceful fallbacks).
- Exposing an **MCP (Model Context Protocol)** server from a Next.js route (`/app/mcp/route.ts`) using:
    - `@modelcontextprotocol/sdk`
    - `mcp-handler`
- Implementing a small “payments-like” flow with:
    - server-side price authority (UI sends only SKU + quantity)
    - idempotency keys for safe retries
    - clear error mapping and status handling


## Tech stack

- **Next.js 16** (App Router, Route Handlers)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **MCP**: `@modelcontextprotocol/sdk` + `mcp-handler`
- Validation: **zod**


## Project highlights (where to look)

- **Widget UI**: `app/page.tsx`
    - Cart, catalog, status UI, and “Buy / Link out” logic.
    - Uses hooks from `app/hooks/*` to talk to the ChatGPT host.
- **Hosted checkout page**: `app/checkout/[sessionId]/page.tsx`
    - Browser-only “Pay (demo)” confirmation.
- **MCP server route**: `app/mcp/route.ts`
    - Registers:
        - a widget resource (HTML)
        - tools:
            - `payment_show`
            - `store_list_products`
            - `store_get_product`
            - `checkout_create_session`
            - `checkout_confirm`
            - `complete_checkout` (Instant Checkout-style callback)
- **Domain logic (server-side)**:
    - Catalog: `src/domain/catalog.ts`
    - Checkout: `src/domain/checkout.ts`
    - In-memory storage: `src/storage/memory.ts`
- **Local product dataset**: `data/products.json`
- **Local dev product feed endpoint**: `app/product-feed.json/route.ts`


## Quickstart (local dev)

### Requirements

- Node.js **>= 20.9.0** (see `package.json#engines`)
- npm (recommended here because a `package-lock.json` is present)

### Install

```bash
npm ci
```

### Run dev server

```bash
npm run dev
```

Open:

- App UI: `http://localhost:3000`
- Hosted checkout pages: `http://localhost:3000/checkout/<sessionId>`
- Product feed (browser fallback): `http://localhost:3000/product-feed.json`

### Build & start (production)

```bash
npm run build
npm run start
```


## Environment variables

This project currently uses:

- `NEXT_PUBLIC_BASE_URL`
    - Used to construct absolute URLs and configure asset loading / widget domain.
    - Default fallback: `http://localhost:3000` (see `baseUrl.ts`)

### Recommended: do not commit `.env.local`

This repo currently contains a `.env.local` file in the folder. For a public GitHub repository, you typically should:

- **NOT** commit `.env.local`
- Create a `.env.example` with variable names only (no secrets)

Example:

```bash
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```


## Running inside ChatGPT vs normal browser

### 1) Normal browser (local dev)

When you run this project in a normal browser:

- The catalog is loaded from `GET /product-feed.json`
- Buttons like **“Buy (try in chat)”** and tool calls are limited because
  `window.openai.callTool` does not exist in a standard browser environment.
- You can still explore the UI, cart logic, and the hosted checkout page.

The widget UI shows a hint like:

> “checkout buttons require ChatGPT App runtime (window.openai.callTool).”

### 2) ChatGPT App runtime

Inside the ChatGPT Apps host, this project can:

- Call MCP tools via `window.openai.callTool(...)`
- Open links via `window.openai.openExternal(...)`
- Request display mode changes (inline / fullscreen)
- Attempt `window.openai.requestCheckout(...)` (if available) for “in-chat checkout”

The integration layer lives in:

- `app/hooks/*`
- `app/layout.tsx` which injects a small bootstrap script to:
    - set `window.__isChatGptApp`
    - patch `fetch()` behavior in iframe contexts to handle base URL / CORS nuances


## Demo flow (what should work)

### Catalog → Cart

1. Open `/`
2. Add a few items to the cart
3. Switch to the **Cart** tab to adjust quantities

### Checkout session (idempotent)

When running in ChatGPT, the widget calls:

- `checkout_create_session` with:
    - `{ lineItems: [{sku, quantity}, ...], idempotencyKey }`

Idempotency behavior is implemented both:

- in the widget (it stores a per-cart fingerprint + key)
- in the server domain logic (`checkoutService.createSession(...)`)

### Checkout completion

Two paths:

- **Buy (try in chat)**:
    - attempts `window.openai.requestCheckout(...)` first
    - falls back to hosted checkout via `openExternal(checkoutUrl)`
- **Link out**:
    - always opens the hosted checkout URL

Hosted checkout page:

- `/checkout/[sessionId]`
- Click **Pay (demo)** → calls `POST /api/checkout/confirm`
- Result: session becomes `confirmed`, returns an `orderId`


## API endpoints

### `GET /product-feed.json`
Returns the product list used for browser fallback mode.

### `GET /api/checkout/sessions/:sessionId`
Returns session summary (`created | confirmed | expired`) and line items.

### `POST /api/checkout/confirm`
Body:

```json
{ "checkoutSessionId": "cs_..." }
```

Returns:

```json
{ "orderId": "o_...", "status": "confirmed", "checkoutSessionId": "cs_..." }
```


## Notes & limitations (intentional for a demo)

- **No database**: sessions and orders live in an in-memory store (`src/storage/memory.ts`).
    - Restarting the dev server resets state.
- **No real payment provider**: “Pay (demo)” is just a server-side confirm call.
- **Server-side pricing authority**:
    - the UI sends only SKU + quantity
    - the server looks up current prices from the catalog dataset
- **Out-of-stock handling**:
    - some products are intentionally `inStock: false` to demonstrate validation errors


## Troubleshooting

### “Buy” / tool calls do nothing in the browser
That’s expected. In a normal browser runtime, `window.openai.*` APIs are not available.

- Use `GET /product-feed.json` to verify product loading.
- Use the hosted checkout page (`/checkout/<sessionId>`) to validate the checkout-confirm flow.

### CORS / asset loading issues in embedded environments
This project sets CORS headers for Next static assets and provides a proxy helper.

Relevant files:

- `next.config.ts` (headers for `/_next/static/*`)
- `proxy.ts` (OPTIONS handling + CORS headers)

If you change `NEXT_PUBLIC_BASE_URL`, make sure it matches the origin you are actually serving from.


## Attribution

Some hooks in `app/hooks/*` are adapted from OpenAI “apps sdk examples” (see comments in those files).
This project keeps them as part of the learning surface and demonstrates how they can be used in a real widget.


## Disclaimer

This is a demo/reference implementation for UI + MCP integration patterns.
It is **not** a production payment system and should not be used as-is to process real money.