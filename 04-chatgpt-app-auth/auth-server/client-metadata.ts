import type { AuthServerConfig } from "./config";
import type { OAuthClient } from "./store";
import { createClient, findClient } from "./store";

type ClientIdMetadataDocument = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
};

type CachedClientIdMetadataDocument = {
  doc: ClientIdMetadataDocument;
  expiresAt: number;
  etag?: string;
  lastModified?: string;
};

const clientIdMetadataCache = new Map<string, CachedClientIdMetadataDocument>();

function tryParseAllowedClientMetadataUrl(params: {
  client_id: string;
  allowedHosts: Set<string>;
}): URL | null {
  try {
    const url = new URL(params.client_id);

    // For safety: only allow https metadata URLs.
    if (url.protocol !== "https:") return null;

    // Spec requires a path component (e.g. https://example.com/client.json)
    if (!url.pathname || url.pathname === "/") return null;

    // No fragments for client_id URLs.
    if (url.hash && url.hash.length > 0) return null;

    const host = url.hostname.toLowerCase();
    if (!params.allowedHosts.has(host)) return null;

    return url;
  } catch {
    return null;
  }
}

function normalizeStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
}

function isLoopbackRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);

    // Jam / native apps sometimes use loopback redirect URIs.
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;

    const host = u.hostname.toLowerCase();
    if (host === "localhost") return true;
    if (host === "127.0.0.1") return true;
    if (host === "[::1]" || host === "::1") return true;

    return false;
  } catch {
    return false;
  }
}

function isValidRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash && u.hash.length > 0) return false;
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeRedirectUris(uris: string[]): string[] {
  return Array.from(
    new Set(
      uris
        .map((u) => u.trim())
        .filter(Boolean)
        .filter(isValidRedirectUri)
    )
  ).sort();
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function parseClientMetadataDocument(raw: unknown): ClientIdMetadataDocument | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;

  const client_id = typeof obj.client_id === "string" ? obj.client_id.trim() : "";
  const client_name = typeof obj.client_name === "string" ? obj.client_name.trim() : "";

  const redirect_uris = normalizeRedirectUris(normalizeStringArray(obj.redirect_uris));
  const token_endpoint_auth_method =
    typeof obj.token_endpoint_auth_method === "string" ? obj.token_endpoint_auth_method.trim() : undefined;

  // Required by MCP spec (Client ID Metadata Documents):
  // MUST include at least { client_id, client_name, redirect_uris }
  if (!client_id || !client_name || redirect_uris.length === 0) return null;

  return {
    client_id,
    client_name,
    redirect_uris,
    ...(token_endpoint_auth_method ? { token_endpoint_auth_method } : {}),
  };
}

function parseCacheControl(v: string | null): { noStore: boolean; noCache: boolean; maxAgeSec?: number } {
  const out: { noStore: boolean; noCache: boolean; maxAgeSec?: number } = {
    noStore: false,
    noCache: false,
  };

  if (!v) return out;

  const directives = v
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  for (const d of directives) {
    if (d === "no-store") out.noStore = true;
    if (d === "no-cache") out.noCache = true;

    const m = d.match(/^max-age=(\d+)$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0) out.maxAgeSec = Math.floor(n);
    }
  }

  return out;
}

function computeCacheExpiry(headers: Headers, nowMs: number): { cacheable: boolean; expiresAt: number } {
  const cc = parseCacheControl(headers.get("cache-control"));

  // no-store => do not cache
  if (cc.noStore) {
    return { cacheable: false, expiresAt: nowMs };
  }

  // max-age is authoritative if present
  if (cc.maxAgeSec != null) {
    return { cacheable: true, expiresAt: nowMs + cc.maxAgeSec * 1000 };
  }

  // Expires header (HTTP date)
  const expiresHeader = headers.get("expires");
  if (expiresHeader) {
    const dt = new Date(expiresHeader);
    if (!Number.isNaN(dt.getTime())) {
      return { cacheable: true, expiresAt: dt.getTime() };
    }
  }

  // no-cache => allow caching but require revalidation each time
  if (cc.noCache) {
    return { cacheable: true, expiresAt: nowMs };
  }

  // Default conservative cache TTL when server provides no caching headers.
  return { cacheable: true, expiresAt: nowMs + 5 * 60 * 1000 };
}

async function fetchClientMetadataDocumentWithCache(
  url: string,
  timeoutMs: number
): Promise<ClientIdMetadataDocument | null> {
  const now = Date.now();
  const cached = clientIdMetadataCache.get(url);

  // Fresh cache hit
  if (cached && cached.expiresAt > now) {
    return cached.doc;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (cached?.etag) headers["If-None-Match"] = cached.etag;
    if (cached?.lastModified) headers["If-Modified-Since"] = cached.lastModified;

    const res = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    // Cache revalidation success
    if (res.status === 304 && cached) {
      const { cacheable, expiresAt } = computeCacheExpiry(res.headers, now);
      if (cacheable) {
        clientIdMetadataCache.set(url, {
          doc: cached.doc,
          expiresAt,
          etag: res.headers.get("etag") ?? cached.etag,
          lastModified: res.headers.get("last-modified") ?? cached.lastModified,
        });
      } else {
        clientIdMetadataCache.delete(url);
      }
      return cached.doc;
    }

    if (!res.ok) {
      return null;
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return null;
    }

    const parsed = parseClientMetadataDocument(json);
    if (!parsed) return null;

    const { cacheable, expiresAt } = computeCacheExpiry(res.headers, now);
    if (cacheable) {
      clientIdMetadataCache.set(url, {
        doc: parsed,
        expiresAt,
        etag: res.headers.get("etag") ?? undefined,
        lastModified: res.headers.get("last-modified") ?? undefined,
      });
    } else {
      clientIdMetadataCache.delete(url);
    }

    return parsed;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * CMID/CIMD: Client ID Metadata Documents support.
 *
 * If the client_id is an HTTPS URL, we fetch and validate the document and "pin" it as the client record.
 * - MUST validate doc.client_id matches the URL (semantic equality).
 * - SHOULD cache per HTTP cache headers.
 * - MUST validate redirect_uri is in redirect_uris.
 */
export async function resolveClientFromClientIdMetadataUrl(params: {
  client_id: string;
  config: AuthServerConfig;
  requestedRedirectUri?: string;
}): Promise<OAuthClient | undefined> {
  const url = tryParseAllowedClientMetadataUrl({
    client_id: params.client_id,
    allowedHosts: params.config.allowedClientMetadataHosts,
  });
  if (!url) return undefined;

  const canonicalClientId = url.href;

  const doc = await fetchClientMetadataDocumentWithCache(canonicalClientId, 4000);
  if (!doc) return undefined;

  // MUST validate that the fetched document's client_id matches the URL.
  try {
    const claimed = new URL(doc.client_id);
    if (claimed.href !== canonicalClientId) return undefined;
  } catch {
    return undefined;
  }

  // This demo only supports public clients ("none").
  const authMethod = (doc.token_endpoint_auth_method ?? "none").trim();
  if (authMethod !== "none") return undefined;

  const redirectUris = new Set<string>(normalizeRedirectUris(doc.redirect_uris));

  // MUST validate redirect URIs against those in the metadata document.
  // For local dev only: allow loopback redirect_uri to be temporarily accepted
  // (some tools use ephemeral ports).
  if (params.requestedRedirectUri) {
    const requested = params.requestedRedirectUri.trim();

    if (!redirectUris.has(requested)) {
      const isDev = process.env.NODE_ENV !== "production";
      if (isDev && isLoopbackRedirectUri(requested)) {
        redirectUris.add(requested);
      } else {
        return undefined;
      }
    }
  }

  const redirect_uris = Array.from(redirectUris).sort();

  // Upsert into our in-memory store (pinned by URL client_id).
  const existing = findClient(canonicalClientId);
  if (existing) {
    const sameName = existing.client_name === doc.client_name;
    const sameRedirects = arraysEqual([...existing.redirect_uris].sort(), redirect_uris);

    if (sameName && sameRedirects) {
      return existing;
    }
  }

  const client = createClient({
    client_id: canonicalClientId,
    client_name: doc.client_name,
    redirect_uris,
    token_endpoint_auth_method: "none",
  });

  if (!existing) {
    console.log(
      "[CLIENT_METADATA] registered client_id(metadata-url)=%s host=%s redirect_uris=%d",
      client.client_id,
      url.hostname,
      client.redirect_uris.length
    );
  } else {
    console.log(
      "[CLIENT_METADATA] updated client_id(metadata-url)=%s host=%s redirect_uris=%d",
      client.client_id,
      url.hostname,
      client.redirect_uris.length
    );
  }

  return client;
}