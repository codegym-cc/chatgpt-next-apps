import type { AuthServerConfig } from "./config";
import { SCOPES_SUPPORTED } from "../shared/scopes";

export function buildAuthorizationServerMetadata(config: AuthServerConfig) {
  return {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth2/authorize`,
    token_endpoint: `${config.issuer}/oauth2/token`,
    registration_endpoint: `${config.issuer}/oauth2/register`,

    // MCP Client ID Metadata Documents (CMID/CIMD)
    // Clients can use an HTTPS URL as client_id that points to a JSON metadata document.
    client_id_metadata_document_supported: config.allowedClientMetadataHosts.size > 0,

    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],

    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...SCOPES_SUPPORTED],

    resource_indicators_supported: true,
  };
}