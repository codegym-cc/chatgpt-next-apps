import { baseURL } from "@/baseUrl";
import { SCOPES_SUPPORTED } from "@/shared/scopes";

function requiredEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (!v || v.trim().length === 0) {
    throw new Error(`Missing env var: ${name}`);
  }
  return v.trim();
}

export function buildProtectedResourceMetadata() {
  const authIssuer = requiredEnv("AUTH_ISSUER", "http://localhost:4000");
  const resource = requiredEnv("MCP_RESOURCE", `${baseURL.replace(/\/+$/, "")}/mcp`);

  return {
    resource,
    authorization_servers: [authIssuer],
    scopes_supported: [...SCOPES_SUPPORTED],
    bearer_methods_supported: ["header"],
    resource_documentation: `${baseURL.replace(/\/+$/, "")}/docs`,
  };
}