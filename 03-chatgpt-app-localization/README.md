# ChatGPT App Demo — Localization + Location-Aware Weather Widgets (MCP + next-intl)

This project is a small **reference implementation** of a ChatGPT App UI built with **Next.js 16 (App Router) + React 19**.

It demonstrates:

- **MCP (Model Context Protocol)** tools exposed from a Next.js route (`/mcp`)
- **Two widgets** (Day / Week weather) rendered from MCP tool output
- **Runtime i18n** inside widgets using **next-intl**, with messages fetched from your app (`/api/i18n/messages`)
- **Location-aware formatting** (units/time zone) resolved server-side from:
    1) tool input (`location`), or
    2) ChatGPT-provided user location metadata (`openai/userLocation`), or
    3) a safe fallback location

> Note: Weather data in this demo uses a **mock provider** (deterministic, no external API calls).  
> No OpenAI API key is required to run the local demo.


## What you can do with this demo

### In a normal browser
- Open the home page and navigate to:
    - `/widgets/day`
    - `/widgets/week`

You will likely see a “no data yet” empty state because the widget expects tool output from the ChatGPT host.

### In ChatGPT (Dev Mode)
- Call MCP tools:
    - `weather_day`
    - `weather_week`
- The tool returns `structuredContent`, and ChatGPT can render the widget UI.


## Tech stack

- **Next.js 16** (App Router)
- **React 19**
- **TypeScript**
- **MCP server + handler**
    - `@modelcontextprotocol/sdk`
    - `mcp-handler`
- **Localization**
    - `next-intl` (widget translations loaded at runtime from `/api/i18n/messages`)
- **Styling**
    - Tailwind CSS (via PostCSS)


## Prerequisites

- **Node.js >= 20.9.0** (see `package.json#engines`)
- **npm** (project includes `package-lock.json`)


## Setup

### 1) Install dependencies

```bash
npm ci
```

### 2) Configure environment variables

This project expects **one public env var**:

- `NEXT_PUBLIC_BASE_URL` — the base URL where this app is reachable.

Create a local file `.env.local`:

```bash
# Local development
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

Why this matters:
- The app uses `NEXT_PUBLIC_BASE_URL` for widget HTML generation and for `assetPrefix` in `next.config.ts`.
- When running inside ChatGPT, your widgets/resources must be served from a stable origin.

> Public repo note: `.env.local` should not be committed. Prefer a `.env.example` (names only) for open-source usage.


## Run locally

### Dev server

```bash
npm run dev
```

Then open:

```text
http://localhost:3000
```

### Production build (local)

```bash
npm run build
npm run start
```


## Key routes

### UI

- `/` — landing page with links to widgets
- `/widgets/day` — Day forecast widget page
- `/widgets/week` — Week forecast widget page

### API

- `/api/i18n/messages?locale=en-US`  
  Returns UI messages for the requested locale (with fallback/normalization).

### MCP endpoint

- `/mcp` — MCP handler (GET/POST)

This is where ChatGPT calls your tools and loads widget resources.


## MCP tools

### `weather_day`

Returns a day forecast **view-model** and can render the "Day" widget.

Input schema:

```ts
{
  locale: string;              // e.g. "en-US" | "ru-RU" | "de-DE"
  day: "current" | "next";     // current = today, next = tomorrow
  location?: string;           // optional, e.g. "Berlin, DE"
}
```

### `weather_week`

Returns a 7-day forecast **view-model** and can render the "Week" widget.

Input schema:

```ts
{
  locale: string;              // e.g. "en-US" | "ru-RU" | "de-DE"
  location?: string;           // optional, e.g. "Berlin, DE"
}
```


## Localization behavior

### Supported locales

This demo intentionally keeps the locale list small:

- `en-US`
- `ru-RU`
- `de-DE`

Locale normalization/aliases include:

- `en`, `en_US`, `en-us` → `en-US`
- `ru`, `ru_RU`, `ru-ru` → `ru-RU`
- `de`, `de_DE`, `de-de` → `de-DE`

### How widget translations are loaded

Widgets do **runtime i18n**:

1. Widget chooses a locale from:
    - tool input `toolInput.locale`, or
    - `window.openai.locale` (if present), or
    - fallback `en-US`

2. Widget fetches messages from:
    - `/api/i18n/messages?locale=...`

3. `next-intl` renders translated strings using the fetched messages.

Why runtime loading:
- It keeps the widget self-contained and avoids bundling multiple locale files into every widget build.
- It mirrors how a host environment (ChatGPT) may provide locale at runtime.


## Location + units/timezone resolution (server-side)

When a tool runs, the server resolves a “context”:

- **Location source priority**
    1. `location` provided in tool input
    2. `openai/userLocation` metadata (if present)
    3. fallback location (demo default)

- **Units**
    - US → `imperial`
    - Others → `metric`
    - If country is unknown → metric + an informational banner

- **Timezone**
    - Derived from known places / user metadata
    - Sanitized; falls back to `UTC` if invalid

This resolved context is included in the tool output so the widget can show “what the server decided”.


## Weather provider

Weather data is generated by a **mock provider** (`lib/weather/providers/mock.ts`):

- deterministic per location + day (nice for demos/tests)
- no external network calls
- no API keys

To replace it with a real provider:
- implement the `WeatherProvider` interface (`lib/weather/provider.ts`)
- inject it into `createWeatherService(...)`


## Troubleshooting

### The widget page shows “No data yet”
That’s expected in a normal browser. The widget expects `toolOutput` from the ChatGPT host.

Try:
- Open `/` and read the hint about calling tools in ChatGPT Dev Mode.
- Use the MCP tools (`weather_day`, `weather_week`) so ChatGPT provides `toolOutput`.

### Widgets work locally but not in ChatGPT
Common causes:
- `NEXT_PUBLIC_BASE_URL` is still `http://localhost:3000` while ChatGPT needs a publicly reachable URL.
- The deployed URL doesn’t match the domain you configured.
- Mixed origins / CORS issues when embedded.


## Scripts

- `npm run dev` — start dev server (Turbopack)
- `npm run build` — production build (Turbopack)
- `npm run start` — run production server
- `npm run lint` / `npm run lint:fix`
- `npm run typecheck`


## Project intent

This is intentionally a **small demo**:
- easy to read
- minimal real-world dependencies
- focused on **MCP + widgets + i18n + location context**

If you extend it, keep the core flow simple:
**Tool call → resolved context → structured content → widget UI.**