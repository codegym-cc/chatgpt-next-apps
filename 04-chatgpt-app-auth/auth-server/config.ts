import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export type AuthServerConfig = {
  authPort: number;
  issuer: string;

  mcpResource: string;
  jwtSecret: string;

  accessTokenTtlSec: number;
  authCodeTtlSec: number;

  allowedRedirectUris: Set<string>;

  /**
   * Compatibility: allow "client_id" to be a URL pointing to a client metadata document
   * (e.g. MCP Jam uses https://www.mcpjam.com/.well-known/oauth/client-metadata.json).
   */
  allowedClientMetadataHosts: Set<string>;
};

function loadDotenvOnce() {
  // Next.js commonly uses .env.local. We'll support both.
  const cwd = process.cwd();
  const candidates = [".env.local", ".env"];

  for (const filename of candidates) {
    const full = path.join(cwd, filename);
    if (fs.existsSync(full)) {
      dotenv.config({ path: full });
    }
  }
}

loadDotenvOnce();

function readInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function readRequired(name: string): string {
  const val = process.env[name] ;
  if (!val || val.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return val.trim();
}

function readCsvSet(name: string): Set<string> {
  const raw = (process.env[name] as string).trim();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function getAuthServerConfig(): AuthServerConfig {
  const authPort = readInt("AUTH_PORT", 4000);

  const issuer = (process.env.AUTH_ISSUER ?? `http://localhost:${authPort}`).trim();
  const mcpResource = (process.env.MCP_RESOURCE ?? "http://localhost:3000/mcp").trim();

  const jwtSecret = readRequired("JWT_SECRET");

  const accessTokenTtlSec = readInt("ACCESS_TOKEN_TTL_SEC", 600);
  const authCodeTtlSec = readInt("AUTH_CODE_TTL_SEC", 600);

  const allowedRedirectUris = readCsvSet("OAUTH_ALLOWED_REDIRECT_URIS");

  if (!allowedRedirectUris.has("https://chatgpt.com/connector_platform_oauth_redirect")) {
    // This is a hard requirement in the PRD.
    throw new Error(
      'OAUTH_ALLOWED_REDIRECT_URIS must include "https://chatgpt.com/connector_platform_oauth_redirect"'
    );
  }

  // Default: allow MCP Jam client-metadata URL host(s) for local testing.
  const allowedClientMetadataHosts = new Set(Array.from(readCsvSet("OAUTH_ALLOWED_CLIENT_METADATA_HOSTS")).map((h) => h.toLowerCase()));

  return {
    authPort,
    issuer,
    mcpResource,
    jwtSecret,
    accessTokenTtlSec,
    authCodeTtlSec,
    allowedRedirectUris,
    allowedClientMetadataHosts,
  };
}