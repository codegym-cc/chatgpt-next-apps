export default function DocsPage() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>MCP OAuth Demo — Docs</h1>
      <p>
        This is a small demo MCP Resource Server protected by OAuth 2.1 Authorization Code + PKCE (S256).
      </p>

      <h2>Endpoints</h2>
      <ul>
        <li>
          <code>GET /.well-known/oauth-protected-resource</code> — Protected Resource Metadata
        </li>
        <li>
          <code>POST /mcp</code> — MCP JSON-RPC endpoint
        </li>
      </ul>

      <h2>Tools</h2>
      <ul>
        <li><code>auth_show</code> (public) — opens widget</li>
        <li><code>auth_whoami</code> (profile:read)</li>
        <li><code>notes_list</code> (notes:read)</li>
        <li><code>notes_add</code> (notes:write)</li>
        <li><code>notes_teaser</code> (optional auth)</li>
      </ul>
    </main>
  );
}