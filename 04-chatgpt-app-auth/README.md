# ChatGPT / MCP OAuth Demo — OAuth 2.1 + PKCE (S256) + Protected Resource Metadata

This project is a **minimal, runnable reference implementation** of a **Model Context Protocol (MCP) Resource Server** protected by **OAuth 2.1 Authorization Code + PKCE (S256)**.

It contains **two servers in one repo**:

1) **Resource Server (RS)** — **Next.js 16** app that:
    - hosts the widget UI (the “Auth Demo Widget”)
    - exposes an MCP JSON-RPC endpoint at `POST /mcp`
    - publishes Protected Resource Metadata at `GET /.well-known/oauth-protected-resource` (RFC 9728)
    - enforces access tokens (JWT **HS256** in this demo) and returns **HTTP `WWW-Authenticate`** challenges

2) **Authorization Server (AS)** — **Node/Express** app located in `./auth-server` that:
    - publishes OAuth Authorization Server Metadata (RFC 8414) and an OIDC-compatible alias
    - supports **Dynamic Client Registration (DCR)** at `POST /oauth2/register`
    - implements the **authorization code + PKCE S256** flow
    - issues access tokens as **HS256 JWTs** (demo-only)

> This repo is intentionally “small but complete” so you can learn how **ChatGPT / MCP clients discover auth**, initiate linking, and retry tool calls with a token.


## What you can do with this demo

- Call a **public tool** (no auth) that opens a widget UI: `auth_show`
- Call a **private tool** without a token and observe:
    - HTTP `401` / `403` responses
    - `WWW-Authenticate: Bearer resource_metadata="..." scope="..." ...`
    - tool-level `_meta["mcp/www_authenticate"]` so MCP clients can trigger account linking
- Complete an **OAuth 2.1 + PKCE** authorization flow and retry tools with a token
- Demonstrate **optional auth** behavior via `notes_teaser` (returns public data if anonymous, private data if authenticated)


## Tech stack

- Next.js `16.0.10` + React `19.2.3`
- MCP server: `@modelcontextprotocol/sdk` + `mcp-handler`
- Auth server: Express
- Validation: Zod
- JWT: `jsonwebtoken` (**HS256 demo secret**)


## Repository layout (high-level)

- `app/` — Next.js App Router (widget UI, MCP route, `/.well-known` metadata)
- `app/mcp/route.ts` — MCP endpoint + OAuth enforcement per tool
- `app/.well-known/oauth-protected-resource/route.ts` — RS discovery metadata
- `auth-server/` — Express OAuth Authorization Server (authorize, token, DCR, metadata)
- `shared/` — shared utilities (PKCE, scopes, JWT helpers)


## Prerequisites

- **Node.js >= 20.9.0** (see `package.json#engines`)
- npm (this repo includes a `package-lock.json`)


## Quickstart (local dev)

### 1) Install dependencies

```bash
npm ci
```

### 2) Create your local environment file

Create `.env.local` at the repo root.

**Important:** `.env.local` must **never** be committed to git.

Minimum recommended variables (names + meaning):

```bash
# ==== Resource Server (Next.js) ====
# The public base URL of your Next app (what the MCP client can reach)
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# OAuth issuer base URL (Auth Server)
AUTH_ISSUER=http://localhost:4000

# Canonical MCP resource identifier
# Must match:
# - Protected Resource Metadata "resource"
# - JWT "aud" (audience)
# - OAuth "resource" parameter
MCP_RESOURCE=http://localhost:3000/mcp

# HS256 signing secret (DEMO ONLY)
JWT_SECRET=dev_only_change_me

# ==== Auth Server (Express) ====
AUTH_PORT=4000
ACCESS_TOKEN_TTL_SEC=600
AUTH_CODE_TTL_SEC=600

# Comma-separated allowlist; MUST include the ChatGPT redirect:
# https://chatgpt.com/connector_platform_oauth_redirect
OAUTH_ALLOWED_REDIRECT_URIS=https://chatgpt.com/connector_platform_oauth_redirect

# If you want to support "client_id as metadata URL" for specific hosts (optional)
OAUTH_ALLOWED_CLIENT_METADATA_HOSTS=
```

Notes:
- `JWT_SECRET` is a **demo shortcut**. For a real service, prefer asymmetric signing + key rotation.
- `MCP_RESOURCE` must be **exactly** what the client uses as the OAuth `resource` parameter.

### 3) Run the servers

#### Option A: two terminals

**Terminal A (Next.js Resource Server on `:3000`):**
```bash
npm run dev
```

**Terminal B (Express Auth Server on `:4000`):**
```bash
npm run dev:auth
```

#### Option B: one command (recommended)

```bash
npm run dev:all
```


## Verify discovery endpoints (curl)

Resource Server — Protected Resource Metadata (RFC 9728):

```bash
curl -s http://localhost:3000/.well-known/oauth-protected-resource | jq .
```

Authorization Server Metadata (RFC 8414 + OIDC-compatible alias):

```bash
curl -s http://localhost:4000/.well-known/oauth-authorization-server | jq .
curl -s http://localhost:4000/.well-known/openid-configuration | jq .
```


## MCP endpoints and tools

### MCP JSON-RPC endpoint

- `POST /mcp` (Next.js route handler)
- Handles:
    - tool registration (via MCP SDK)
    - per-tool auth policy enforcement
    - CORS
    - returning `WWW-Authenticate` challenges and MCP `_meta["mcp/www_authenticate"]`

### Tools implemented

| Tool name       | Auth mode | Required scope(s)  | Description |
|----------------|----------:|--------------------|-------------|
| `auth_show`    | public    | none               | Opens the widget UI (HTML+Skybridge) |
| `auth_whoami`  | oauth2    | `profile:read`     | Returns current user identity |
| `notes_list`   | oauth2    | `notes:read`       | Lists private notes |
| `notes_add`    | oauth2    | `notes:write`      | Adds a private note |
| `notes_teaser` | optional  | `notes:read` (opt) | Public teaser if anonymous; private notes if authenticated |


## End-to-end flow (what happens when auth is missing)

This is the core behavior MCP clients rely on:

1) Client calls a protected tool (e.g. `notes_list`) **without** `Authorization: Bearer ...`
2) Resource Server responds with:
    - HTTP `401` (or `403` for insufficient scope)
    - a `WWW-Authenticate` header containing:
        - `resource_metadata=".../.well-known/oauth-protected-resource"`
        - `scope="..."`
        - (optional) `error="invalid_token"` / `error="insufficient_scope"`
    - JSON-RPC tool result includes:
        - `_meta["mcp/www_authenticate"]` containing the same challenge string
3) Client fetches:
    - RS metadata from `/.well-known/oauth-protected-resource` (discovers `authorization_servers`)
    - AS metadata from `/.well-known/oauth-authorization-server`
4) Client registers (DCR) at `POST /oauth2/register` (if needed)
5) Client runs authorization code + PKCE:
    - `GET /oauth2/authorize?...&code_challenge=...&code_challenge_method=S256&resource=<MCP_RESOURCE>`
6) Client exchanges code for token at `POST /oauth2/token` with `code_verifier`
7) Client retries tool call with `Authorization: Bearer <token>` and succeeds


## Demo login credentials

The auth server uses an in-memory demo user:

- Username: `alex`
- Password: `password`

See `auth-server/store.ts`.


## Running over the internet (ngrok / HTTPS)

When testing inside a hosted environment (ChatGPT / connector sandboxes / MCP tooling), you typically need **public HTTPS URLs**.

High-level steps:

1) Expose the **Resource Server** (Next.js) over HTTPS.
2) Expose the **Auth Server** (Express) over HTTPS.
3) Set:
    - `NEXT_PUBLIC_BASE_URL=https://<your-public-rs-host>`
    - `AUTH_ISSUER=https://<your-public-as-host>`
    - `MCP_RESOURCE=https://<your-public-rs-host>/mcp`
4) Ensure `OAUTH_ALLOWED_REDIRECT_URIS` includes:
    - `https://chatgpt.com/connector_platform_oauth_redirect`
    - plus any other redirect URIs you expect for your testing toolchain


## Useful scripts

```bash
# Run Next.js RS
npm run dev

# Run Express AS
npm run dev:auth

# Run both concurrently
npm run dev:all

# Lint + TypeScript checks
npm run lint
npm run typecheck

# Production build
npm run build
npm run start
npm run start:auth
```


## Security notes (read before publishing)

- **Do not commit `.env.local`** (it contains secrets like `JWT_SECRET`).
- This demo uses **HS256** JWTs with a shared secret (`JWT_SECRET`) for simplicity.
    - For production: use a proper auth provider, asymmetric keys, key rotation, and secure storage.
- The auth server stores users/clients/codes **in memory** — it is not durable or multi-instance safe.


## Troubleshooting

### “Authentication required” but no linking UI appears
- Confirm the tool call is hitting the **MCP endpoint** (`POST /mcp`) and not your Next.js page route.
- Confirm the response includes:
    - `WWW-Authenticate` header
    - JSON-RPC `_meta["mcp/www_authenticate"]`

### Tokens are rejected (401 invalid_token)
Most commonly:
- `AUTH_ISSUER` mismatch between RS and AS
- `MCP_RESOURCE` mismatch (JWT `aud` must equal RS configured resource)
- `JWT_SECRET` mismatch between RS and AS

### Static assets fail to load in an embedded environment
This project uses:
- `assetPrefix` based on `NEXT_PUBLIC_BASE_URL`
- CORS headers for `/_next/static/*`

If you change hosting, ensure `NEXT_PUBLIC_BASE_URL` is correct and publicly reachable.