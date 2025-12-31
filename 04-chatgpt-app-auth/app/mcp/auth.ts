import { baseURL } from "@/baseUrl";
import { verifyAccessToken, type AccessTokenClaims } from "@/shared/jwt";
import { hasAllScopes, scopeClaimToSet } from "@/shared/scopes";
import { AsyncLocalStorage } from "node:async_hooks";

export type VerifiedAuthContext = {
  token: string;
  claims: AccessTokenClaims;
  sub: string;
  name?: string;
  scopes: Set<string>;
};

const authStorage = new AsyncLocalStorage<VerifiedAuthContext | null>();

export function runWithAuthContext<T>(ctx: VerifiedAuthContext | null, fn: () => T): T {
  return authStorage.run(ctx, fn);
}

export function getAuthContext(): VerifiedAuthContext | null {
  return authStorage.getStore() ?? null;
}

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v.trim();
}

export type ToolPolicy =
  | { kind: "public" }
  | { kind: "required"; requiredScopes: string[] }
  | { kind: "optional"; optionalScopes: string[] };

export const TOOL_POLICIES: Record<string, ToolPolicy> = {
  auth_show: { kind: "public" },

  auth_whoami: { kind: "required", requiredScopes: ["profile:read"] },

  notes_list: { kind: "required", requiredScopes: ["notes:read"] },
  notes_add: { kind: "required", requiredScopes: ["notes:write"] },

  notes_teaser: { kind: "optional", optionalScopes: ["notes:read"] },
};

export function getToolPolicy(toolName: string | undefined): ToolPolicy | undefined {
  if (!toolName) return undefined;
  return TOOL_POLICIES[toolName];
}

export function parseBearerTokenFromHeader(header: string | null): string | null {
  if (!header) return null;
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return m[1]?.trim() || null;
}

export type VerifyResult =
  | { status: "none" }
  | { status: "invalid"; reason: string }
  | { status: "valid"; ctx: VerifiedAuthContext };

export function verifyBearerFromRequest(req: Request): VerifyResult {
  const token = parseBearerTokenFromHeader(req.headers.get("authorization"));
  if (!token) return { status: "none" };

  const jwtSecret = requiredEnv("JWT_SECRET");
  const issuer = requiredEnv("AUTH_ISSUER");
  const audience = requiredEnv("MCP_RESOURCE");

  try {
    console.log("verifyAccessToken 1", token, { secret: jwtSecret, issuer, audience })
    const claims = verifyAccessToken(token, { secret: jwtSecret, issuer, audience });
    console.log("verifyAccessToken 2", claims)
    const scopes = scopeClaimToSet(claims.scope);
    console.log("verifyAccessToken 3", scopes)

    return {
      status: "valid",
      ctx: {
        token,
        claims,
        sub: claims.sub,
        name: typeof claims.name === "string" ? claims.name : undefined,
        scopes,
      },
    };
  } catch (e) {
    return {
      status: "invalid",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

function escapeHeaderValue(v: string): string {
  // minimal escaping for quoted-string values
  return v.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function buildWwwAuthenticate(params: {
  scope?: string;
  error?: "invalid_token" | "insufficient_scope";
  error_description?: string;
}): string {
  const resourceMetadataUrl = new URL("/.well-known/oauth-protected-resource", baseURL).toString();

  const parts: string[] = [];
  parts.push(`Bearer resource_metadata="${escapeHeaderValue(resourceMetadataUrl)}"`);

  if (params.scope) {
    parts.push(`scope="${escapeHeaderValue(params.scope)}"`);
  }
  if (params.error) {
    parts.push(`error="${params.error}"`);
  }
  if (params.error_description) {
    parts.push(`error_description="${escapeHeaderValue(params.error_description)}"`);
  }

  return parts.join(", ");
}

export type JsonRpcId = string | number | null;

export function buildJsonRpcToolAuthError(params: {
  id: JsonRpcId;
  wwwAuthenticate: string;
  message: string;
}) {
  return {
    jsonrpc: "2.0",
    id: params.id,
    result: {
      isError: true,
      content: [{ type: "text", text: params.message }],
      _meta: {
        "mcp/www_authenticate": [params.wwwAuthenticate],
      },
    },
  };
}

export function corsify(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  headers.set("Cache-Control", headers.get("Cache-Control") ?? "no-store");

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

export function enforceScopesOrThrow(ctx: VerifiedAuthContext, required: string[]) {
  if (!hasAllScopes(ctx.scopes, required)) {
    const missing = required.filter((s) => !ctx.scopes.has(s));
    throw new Error(`Missing scopes: ${missing.join(", ")}`);
  }
}