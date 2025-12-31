import express from "express";
import type { Request, Response } from "express";
import { getAuthServerConfig } from "./config";
import { buildAuthorizationServerMetadata } from "./well-known";
import { createClient, findClient, usersByUsername, type OAuthClient } from "./store";
import { redeemAuthorizationCode, validateAuthorizeRequest, issueAuthorizationCode } from "./oauth";
import { renderAuthorizePage } from "./ui";
import { formatScopeParam, normalizeScopes, parseScopeParam } from "../shared/scopes";
import { resolveClientFromClientIdMetadataUrl } from "./client-metadata";
import cors from "cors";

const config = getAuthServerConfig();


const app = express();

app.use(cors({
  origin: true, // reflects the Origin back (better than "*", especially if credentials are needed)
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "DPoP"],
  exposedHeaders: ["WWW-Authenticate"],
}));

// Preflight для всех путей
app.options("*", cors({ origin: true }));


// parse JSON for DCR
app.use(express.json());
// parse x-www-form-urlencoded for /authorize POST and /token
app.use(express.urlencoded({ extended: false }));

function jsonError(res: Response, status: number, body: unknown) {
  res.status(status);
  res.setHeader("Cache-Control", "no-store");
  res.json(body);
}

function redirectWithParams(res: Response, redirectUri: string, params: Record<string, string>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v);
  }
  res.redirect(302, u.toString());
}

async function resolveClient(client_id: string, requestedRedirectUri?: string): Promise<OAuthClient | undefined> {
  // 1) CMID/CIMD path: client_id can be an HTTPS URL pointing to a client metadata document.
  //    (pinned client identity, cached per HTTP cache headers)
  const cimdClient = await resolveClientFromClientIdMetadataUrl({
    client_id,
    config,
    requestedRedirectUri,
  });
  if (cimdClient) return cimdClient;

  // 2) Pre-registered / DCR clients: stored locally by client_id.
  return findClient(client_id);
}

/**
 * Health
 */
app.get("/", (_req, res) => {
  res.type("text/plain").send("Auth Server OK");
});

/**
 * OAuth AS metadata (RFC 8414)
 */
app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(buildAuthorizationServerMetadata(config));
});

/**
 * OIDC-compatible alias:
 * PRD says: return the same JSON as oauth-authorization-server.
 */
app.get("/.well-known/openid-configuration", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(buildAuthorizationServerMetadata(config));
});

/**
 * DCR (Dynamic Client Registration)
 * PRD: required for MVP
 */
app.post("/oauth2/register", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const client_name = typeof body.client_name === "string" ? body.client_name : "ChatGPT Connector";
  const token_endpoint_auth_method =
    typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  const redirect_uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : null;

  if (!redirect_uris || redirect_uris.length === 0) {
    return jsonError(res, 400, { error: "invalid_client_metadata" });
  }

  if (token_endpoint_auth_method !== "none") {
    return jsonError(res, 400, { error: "invalid_client_metadata" });
  }

  const normalized = redirect_uris
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter(Boolean);

  if (normalized.length === 0) {
    return jsonError(res, 400, { error: "invalid_client_metadata" });
  }

  // allowlist exact match
  for (const uri of normalized) {
    if (!config.allowedRedirectUris.has(uri)) {
      return jsonError(res, 400, { error: "invalid_client_metadata" });
    }
  }

  const client = createClient({
    client_name,
    redirect_uris: normalized,
    token_endpoint_auth_method: "none",
  });

  console.log("[DCR] client_id=%s redirect_uris=%d", client.client_id, client.redirect_uris.length);

  res.status(201);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
  });
});

/**
 * GET /oauth2/authorize (show login+consent UI)
 */
app.get("/oauth2/authorize", async (req: Request, res: Response) => {
  const client_id = typeof req.query.client_id === "string" ? req.query.client_id : "";
  const redirect_uri = typeof req.query.redirect_uri === "string" ? req.query.redirect_uri : "";

  const client = client_id ? await resolveClient(client_id, redirect_uri) : undefined;

  const validation = validateAuthorizeRequest({
    query: req.query as Record<string, unknown>,
    config,
    client,
  });

  if (!validation.ok) {
    // Prefer 400 (PRD suggests not redirecting to unknown redirect_uri on error)
    res.status(400).type("text/plain").send(`invalid_request: ${validation.err.error_description ?? ""}`);
    return;
  }

  const html = renderAuthorizePage({
    clientName: validation.client.client_name,
    client_id: validation.request.client_id,
    redirect_uri: validation.request.redirect_uri,
    scope: validation.request.scope,
    state: validation.request.state,
    code_challenge: validation.request.code_challenge,
    code_challenge_method: "S256",
    response_type: "code",
    resource: validation.request.resource,
  });

  res.status(200).type("text/html").send(html);
});

/**
 * POST /oauth2/authorize (submit login+consent)
 * Body: x-www-form-urlencoded
 */
app.post("/oauth2/authorize", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const decision = typeof body.decision === "string" ? body.decision : "";
  const client_id = typeof body.client_id === "string" ? body.client_id : "";
  const redirect_uri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  const state = typeof body.state === "string" ? body.state : "";
  const resource = typeof body.resource === "string" ? body.resource : "";
  const scope = typeof body.scope === "string" ? body.scope : "";
  const code_challenge = typeof body.code_challenge === "string" ? body.code_challenge : "";
  const code_challenge_method = typeof body.code_challenge_method === "string" ? body.code_challenge_method : "";

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  const client = client_id ? await resolveClient(client_id, redirect_uri) : undefined;

  // Re-validate using the same logic as GET (build a "query-like" object)
  const validation = validateAuthorizeRequest({
    query: {
      response_type: "code",
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      resource,
    },
    config,
    client,
  });

  if (!validation.ok) {
    res.status(400).type("text/plain").send(`invalid_request: ${validation.err.error_description ?? ""}`);
    return;
  }

  if (decision === "deny") {
    console.log("[AUTHORIZE] client_id=%s decision=deny", client_id);
    return redirectWithParams(res, validation.request.redirect_uri, {
      error: "access_denied",
      state: validation.request.state,
    });
  }

  // decision=allow
  const user = usersByUsername.get(username);
  if (!user || user.password !== password) {
    const html = renderAuthorizePage({
      clientName: validation.client.client_name,
      client_id: validation.request.client_id,
      redirect_uri: validation.request.redirect_uri,
      scope: validation.request.scope,
      state: validation.request.state,
      code_challenge: validation.request.code_challenge,
      code_challenge_method: "S256",
      response_type: "code",
      resource: validation.request.resource,
      error: "Invalid username or password",
    });

    res.status(401).type("text/html").send(html);
    return;
  }

  const normalizedScope = formatScopeParam(normalizeScopes(parseScopeParam(validation.request.scope)));

  const code = issueAuthorizationCode({
    config,
    request: { ...validation.request, scope: normalizedScope, scopes: normalizeScopes(parseScopeParam(normalizedScope)) },
    user,
  });

  console.log("[AUTHORIZE] client_id=%s decision=allow scope=%s", client_id, normalizedScope);

  return redirectWithParams(res, validation.request.redirect_uri, {
    code,
    state: validation.request.state,
  });
});

/**
 * POST /oauth2/token
 * grant_type=authorization_code only
 */
app.post("/oauth2/token", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const grant_type = typeof body.grant_type === "string" ? body.grant_type : "";
  const code = typeof body.code === "string" ? body.code : "";
  const redirect_uri = typeof body.redirect_uri === "string" ? body.redirect_uri : "";
  const client_id = typeof body.client_id === "string" ? body.client_id : "";
  const code_verifier = typeof body.code_verifier === "string" ? body.code_verifier : "";
  const resource = typeof body.resource === "string" ? body.resource : "";

  if (grant_type !== "authorization_code") {
    return jsonError(res, 400, { error: "invalid_request" });
  }

  if (!code || !redirect_uri || !client_id || !code_verifier || !resource) {
    return jsonError(res, 400, { error: "invalid_request" });
  }

  const client = await resolveClient(client_id, redirect_uri);

  const tokenRes = redeemAuthorizationCode({
    config,
    code,
    client,
    client_id,
    redirect_uri,
    resource,
    code_verifier,
  });

  if (!tokenRes.ok) {
    const status = tokenRes.err.error === "invalid_grant" ? 400 : 400;
    return jsonError(res, status, { error: tokenRes.err.error });
  }

  console.log("[TOKEN] client_id=%s scope=%s aud(resource)=%s", client_id, tokenRes.scope, resource);

  res.setHeader("Cache-Control", "no-store");
  res.json(tokenRes);
});

app.listen(config.authPort, () => {
  console.log(`[AUTH] listening on port ${config.authPort}`);
  console.log(`[AUTH] issuer=${config.issuer}`);
  console.log(`[AUTH] mcp_resource=${config.mcpResource}`);
});