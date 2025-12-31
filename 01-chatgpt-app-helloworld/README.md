# HelloWorld — Next.js ChatGPT App Demo (MCP + Widget UI)

A tiny reference implementation showing how to build a ChatGPT App-style widget UI + an MCP server endpoint using:

- Next.js 16 (App Router)
- React 19
- MCP server wiring (`@modelcontextprotocol/sdk` + `mcp-handler`)
- Tailwind CSS v4

## What this repo demonstrates

### Endpoints

- `/`  
  Widget UI (React). Shows two actions:
    - fetch server time from `/api/time`
    - open an external link using `window.openai.openExternal` (with a browser fallback)

- `/api/time`  
  Simple route handler that returns current server time.

- `/mcp`  
  MCP endpoint (GET/POST) that registers:
    - an MCP resource containing the widget HTML
    - an MCP tool that returns a minimal response + widget metadata

### Why the `NEXT_PUBLIC_BASE_URL` exists

When the widget runs inside a host environment (for example, embedded in an iframe),
`window.location.origin` may not match your app’s real origin.

This demo uses `NEXT_PUBLIC_BASE_URL` to:
- set `assetPrefix` (so `/_next/static/*` assets are loaded from your app origin)
- generate absolute URLs in the HTML widget resource
- make client-side fetches hit the correct server origin

## Quickstart

### 1) Install

Choose one:

```bash
npm install
```

### 2) Configure env

Create `.env.local`:

```bash
# Linux/macOS
cp .env.example .env.local
```

Then edit `.env.local`:

- `NEXT_PUBLIC_BASE_URL` should be the public origin where this app is reachable.
  Examples:
    - local: `http://localhost:3000`
    - dev tunnel: `https://<your-tunnel-domain>`

### 3) Run dev server

```bash
npm run dev
```

Open:

- `http://localhost:3000`

## Using it in ChatGPT Developer Mode (high level)

1) Run the app locally.
2) Expose it via an HTTPS tunnel (or deploy it).
3) Configure the MCP server URL as:

```text
https://<your-public-domain>/mcp
```

4) Ensure `NEXT_PUBLIC_BASE_URL` matches the same origin.

## Where to change things

- UI: `app/page.tsx`
- MCP logic (tools/resources/CSP): `app/mcp/route.ts`
- Demo API route: `app/api/time/route.ts`
- Host integration hooks: `app/hooks/*`
- Asset/CORS config: `next.config.ts` and `proxy.ts`

## Security notes (important)

This demo intentionally enables permissive CORS (e.g. `Access-Control-Allow-Origin: *`)
to make embedding/testing easier.

If you build a real app, restrict CORS (origins + headers) and review CSP rules carefully.