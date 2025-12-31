# Private Jet Explorer — ChatGPT Widgets + MCP (Next.js 16 / React 19)

A small **educational** Next.js app that demonstrates how to build **ChatGPT “widgets”** powered by **MCP (Model Context Protocol)** tools.

The core idea is **thin UI / thick server**:

- The UI renders a **view-model** returned by server-side tools (MCP tools).
- ChatGPT calls those tools, receives **structuredContent**, and the widget pages render it.
- The same pages also run in a normal browser (with graceful fallbacks).

## What’s included

### Widgets (UI routes)
- **Home**: `/` — entry page with links to widgets.
- **Explorer widget**: `/explorer`
    - Renders a list of jets (from the `search_jet` tool output).
    - Can load details via **tool-call from the UI** (`callTool("get_jet")`) when running inside ChatGPT.
    - Can select 2–5 jets and ask ChatGPT to compare them (via follow-up message).
- **Compare widget**: `/compare`
    - Renders a comparison table using a server-provided view-model (from `compare_jets` tool output).

### MCP endpoint
- **MCP route**: `/mcp` (Next.js route handler)
    - Registers:
        - **Resources** (HTML widgets rendered from `/explorer` and `/compare`)
        - **Tools**:
            - `search_jet`
            - `get_jet`
            - `compare_jets`

### Demo API (non-persistent)
- `GET /api/favorites` and `POST /api/favorites`
    - Stores favorites in an **in-memory Set** (resets on server restart).
    - **Demo only**—not suitable for production.


## Tech stack

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS v4**
- **MCP**:
    - `@modelcontextprotocol/sdk`
    - `mcp-handler`
- **Validation**: `zod`


## Prerequisites

- **Node.js >= 20.9.0** (required by `package.json#engines`)
- npm (a `package-lock.json` is present)


## Setup

This project uses a single public env var:

- `NEXT_PUBLIC_BASE_URL` — the public origin used to:
    - build absolute asset URLs (images, etc.)
    - set `assetPrefix` in `next.config.ts`
    - allow the MCP server to fetch widget HTML from `/explorer` and `/compare`

### Local development (recommended)
Create a local env file:

**`.env.local`**
```bash
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

> Note: `.env.local` should not be committed in a public repo. Commit a `.env.example` instead (names only), but this README focuses on running the demo.


## Run the app

From the `02-chatgpt-app-widgets` folder:

```bash
npm ci
npm run dev
```

Then open:
- http://localhost:3000


## Use it in a regular browser (without ChatGPT)

You can open:
- `/explorer` and `/compare`

However, in a normal browser:
- `toolOutput` will typically be empty (because ChatGPT isn’t injecting it),
- `callTool()` won’t be available,
- the pages will show “empty state” hints.

This is expected: the **full experience appears when the widget runs inside ChatGPT**.


## Use it inside ChatGPT (Widgets + MCP)

The exact UI steps depend on your ChatGPT client/build, but the architecture is:

1. **Run the server on a publicly reachable URL** (usually HTTPS).
2. Set:
    - `NEXT_PUBLIC_BASE_URL` to that public URL (example: `https://your-tunnel.example`)
3. Configure ChatGPT to use your MCP server endpoint:
    - `https://your-tunnel.example/mcp`
4. Ask ChatGPT to call the tools. Example prompts:
    - “Show 5 private jets optimized for range.” → should call `search_jet`
    - “Open details for the Phenom.” → should call `get_jet`
    - “Compare these two jets and pick the best.” → should call `compare_jets`

### Important note about `NEXT_PUBLIC_BASE_URL`
The MCP handler fetches widget HTML from your running app during initialization (it requests `/explorer` and `/compare`). That means:

- If you use a tunnel (ngrok / Cloudflare Tunnel / etc.), you must set:
    - `NEXT_PUBLIC_BASE_URL=https://your-public-domain`
- Otherwise, the MCP server may generate HTML with incorrect absolute URLs (images, assets).


## Tool reference (MCP)

### `search_jet`
Searches a small in-repo catalog and returns compact cards.

Input (simplified):
- `query` (string)
- optional filters: `rangeKmMin`, `seatsMin`, `priceUsdMax`
- optional `sort`: `price_asc | price_desc | range_desc | seats_desc`
- optional `limit` (1–20)

Output:
- `structuredContent: { items: JetCard[] }`

### `get_jet`
Fetches details for a single jet by id.

Input:
- `{ id: string }`

Output:
- `structuredContent: JetDetails`

### `compare_jets`
Compares 2–5 jets and returns a ready-to-render view-model.

Input:
- `{ ids: string[] }` (2–5 items)

Output:
- `structuredContent: CompareViewModel` (table rows, bestPickId, reasons)


## Project structure (high level)

- `app/`
    - `page.tsx` — home page
    - `explorer/page.tsx` — Explorer widget UI
    - `compare/page.tsx` — Compare widget UI
    - `mcp/route.ts` — MCP server: resources + tools
    - `api/favorites/route.ts` — demo-only favorites API
    - `hooks/` — hooks copied/adapted from OpenAI Apps SDK examples (used to talk to the host)
- `lib/jets/`
    - `jets.data.ts` — demo catalog
    - `jetSearch.ts` — simple search + sorting
    - `jetCompare.ts` — scoring + view-model generation
    - `jetService.ts` — mapping catalog → cards/details + compare view-model
- `public/images/jets/placeholder.svg`


## Security / production notes (read before copying patterns)

This repo is a **demo** and intentionally makes tradeoffs for clarity:

- Favorites are stored **in memory** (not persistent, not multi-instance safe).
- CORS / widget embedding concerns are handled in a permissive way for demo UX.
- No authentication, rate limiting, or data validation beyond basic schema checks.

If you plan to productionize:
- use a real datastore for favorites
- add auth / abuse protection
- restrict CORS
- review CSP requirements carefully for widget rendering contexts


## Useful commands

```bash
# dev
npm run dev

# typecheck
npm run typecheck

# lint
npm run lint

# production build
npm run build
npm run start
```


## Troubleshooting

### “No results yet” in Explorer
In a regular browser, this is expected. The widget expects `toolOutput` from ChatGPT tool calls.

### Images not loading in ChatGPT widget
Make sure `NEXT_PUBLIC_BASE_URL` matches the URL ChatGPT uses to load the widget content (especially when using a tunnel).

### Favorites reset unexpectedly
Favorites are stored in memory. Restarting the dev server clears them.

