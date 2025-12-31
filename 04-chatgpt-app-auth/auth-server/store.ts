import crypto from "node:crypto";

export type DemoUser = {
  id: string;
  username: string;
  password: string;
  displayName: string;
};

export type OAuthClient = {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  created_at: number;
};

export type AuthCodeRecord = {
  code: string;

  client_id: string;
  redirect_uri: string;

  resource: string;
  scope: string;

  code_challenge: string;
  code_challenge_method: "S256";

  user_id: string;
  user_name?: string;

  created_at: number;
  expires_at: number;

  used: boolean;
};

export const usersByUsername = new Map<string, DemoUser>();
export const clientsById = new Map<string, OAuthClient>();
export const authCodesByCode = new Map<string, AuthCodeRecord>();

// Demo user(s)
usersByUsername.set("alex", {
  id: "u_123",
  username: "alex",
  password: "password",
  displayName: "Alex",
});

export function createClient(params: {
  /**
   * Optional explicit client_id.
   * - Used for client-metadata URL clients (e.g. MCP Jam).
   * - For DCR we omit it and generate a new one.
   */
  client_id?: string;
  client_name: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
}): OAuthClient {
  const client_id = params.client_id ?? `c_${crypto.randomUUID().replace(/-/g, "")}`;

  const existing = clientsById.get(client_id);

  const client: OAuthClient = {
    client_id,
    client_name: params.client_name,
    redirect_uris: params.redirect_uris,
    token_endpoint_auth_method: params.token_endpoint_auth_method,
    // Preserve original created_at if we're effectively "upserting" the same client_id.
    created_at: existing?.created_at ?? Date.now(),
  };

  clientsById.set(client_id, client);
  return client;
}

export function findClient(client_id: string): OAuthClient | undefined {
  return clientsById.get(client_id);
}

export function saveAuthCode(record: AuthCodeRecord) {
  authCodesByCode.set(record.code, record);
}

export function findAuthCode(code: string): AuthCodeRecord | undefined {
  return authCodesByCode.get(code);
}

export function markAuthCodeUsed(code: string) {
  const rec = authCodesByCode.get(code);
  if (!rec) return;
  rec.used = true;
  authCodesByCode.set(code, rec);
}