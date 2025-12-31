import crypto from "node:crypto";
import type { AuthServerConfig } from "./config";
import type { AuthCodeRecord, DemoUser, OAuthClient } from "./store";
import { findAuthCode, markAuthCodeUsed, saveAuthCode } from "./store";
import { computeS256CodeChallenge, constantTimeEqual } from "../shared/pkce";
import {
  isSubsetOfSupportedScopes,
  normalizeScopes,
  parseScopeParam,
} from "../shared/scopes";
import { signAccessToken } from "../shared/jwt";

export type OAuthError =
  | { error: "invalid_request"; error_description?: string }
  | { error: "unauthorized_client"; error_description?: string }
  | { error: "invalid_grant"; error_description?: string };

function firstString(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return undefined;
}

export type ValidatedAuthorizeRequest = {
  response_type: "code";
  client_id: string;
  redirect_uri: string;
  scope: string;
  state: string;
  code_challenge: string;
  code_challenge_method: "S256";
  resource: string;

  scopes: string[];
};

export function validateAuthorizeRequest(params: {
  query: Record<string, unknown>;
  config: AuthServerConfig;
  client: OAuthClient | undefined;
}): { ok: true; request: ValidatedAuthorizeRequest; client: OAuthClient } | { ok: false; err: OAuthError } {
  const response_type = firstString(params.query.response_type);
  const client_id = firstString(params.query.client_id);
  const redirect_uri = firstString(params.query.redirect_uri);
  const scope = firstString(params.query.scope) ?? "";
  const state = firstString(params.query.state) ?? "";
  const code_challenge = firstString(params.query.code_challenge);
  const code_challenge_method = firstString(params.query.code_challenge_method);
  const resource = firstString(params.query.resource);

  if (response_type !== "code") {
    return { ok: false, err: { error: "invalid_request", error_description: "response_type must be code" } };
  }

  if (!client_id || !redirect_uri || !code_challenge || !code_challenge_method || !resource) {
    return { ok: false, err: { error: "invalid_request", error_description: "Missing required parameters" } };
  }

  if (!params.client) {
    return { ok: false, err: { error: "unauthorized_client", error_description: "Unknown client_id" } };
  }

  if (!params.client.redirect_uris.includes(redirect_uri)) {
    return { ok: false, err: { error: "invalid_request", error_description: "redirect_uri not allowed for this client" } };
  }

  if (code_challenge_method !== "S256") {
    return { ok: false, err: { error: "invalid_request", error_description: "code_challenge_method must be S256" } };
  }

  if (resource !== params.config.mcpResource) {
    return { ok: false, err: { error: "invalid_request", error_description: "resource must match MCP_RESOURCE" } };
  }

  const requestedScopes = normalizeScopes(parseScopeParam(scope));
  if (requestedScopes.length === 0) {
    return { ok: false, err: { error: "invalid_request", error_description: "scope is required" } };
  }
  if (!isSubsetOfSupportedScopes(requestedScopes)) {
    return { ok: false, err: { error: "invalid_request", error_description: "Requested scope is not supported" } };
  }

  return {
    ok: true,
    client: params.client,
    request: {
      response_type: "code",
      client_id,
      redirect_uri,
      scope: requestedScopes.join(" "),
      state,
      code_challenge,
      code_challenge_method: "S256",
      resource,
      scopes: requestedScopes,
    },
  };
}

export function issueAuthorizationCode(params: {
  config: AuthServerConfig;
  request: ValidatedAuthorizeRequest;
  user: DemoUser;
}): string {
  const code = `ac_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = Date.now();

  const record: AuthCodeRecord = {
    code,

    client_id: params.request.client_id,
    redirect_uri: params.request.redirect_uri,

    resource: params.request.resource,
    scope: params.request.scope,

    code_challenge: params.request.code_challenge,
    code_challenge_method: "S256",

    user_id: params.user.id,
    user_name: params.user.displayName,

    created_at: now,
    expires_at: now + params.config.authCodeTtlSec * 1000,

    used: false,
  };

  saveAuthCode(record);
  return code;
}

export function redeemAuthorizationCode(params: {
  config: AuthServerConfig;

  code: string;
  client: OAuthClient | undefined;
  client_id: string;
  redirect_uri: string;

  resource: string;
  code_verifier: string;
}): { ok: true; access_token: string; token_type: "Bearer"; expires_in: number; scope: string } | { ok: false; err: OAuthError } {
  if (!params.client) {
    return { ok: false, err: { error: "unauthorized_client", error_description: "Unknown client_id" } };
  }

  const rec = findAuthCode(params.code);
  if (!rec) {
    return { ok: false, err: { error: "invalid_grant", error_description: "Unknown code" } };
  }

  const now = Date.now();
  if (rec.used || rec.expires_at <= now) {
    return { ok: false, err: { error: "invalid_grant", error_description: "Code expired or already used" } };
  }

  if (rec.client_id !== params.client_id) {
    return { ok: false, err: { error: "invalid_grant", error_description: "client_id mismatch" } };
  }

  if (rec.redirect_uri !== params.redirect_uri) {
    return { ok: false, err: { error: "invalid_grant", error_description: "redirect_uri mismatch" } };
  }

  if (rec.resource !== params.resource || params.resource !== params.config.mcpResource) {
    return { ok: false, err: { error: "invalid_request", error_description: "resource mismatch" } };
  }

  const computed = computeS256CodeChallenge(params.code_verifier);
  if (!constantTimeEqual(computed, rec.code_challenge)) {
    return { ok: false, err: { error: "invalid_request", error_description: "PKCE verification failed" } };
  }

  // mark used (single-use)
  markAuthCodeUsed(params.code);

  const { token, expiresIn } = signAccessToken({
    issuer: params.config.issuer,
    subject: rec.user_id,
    audience: rec.resource,
    scope: rec.scope,
    name: rec.user_name,
    secret: params.config.jwtSecret,
    ttlSec: params.config.accessTokenTtlSec,
  });

  return {
    ok: true,
    access_token: token,
    token_type: "Bearer",
    expires_in: expiresIn,
    scope: rec.scope,
  };
}