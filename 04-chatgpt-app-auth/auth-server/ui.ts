function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderAuthorizePage(params: {
  clientName: string;
  scope: string;
  resource: string;

  // original oauth params to round-trip in the POST
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  code_challenge_method: "S256";
  response_type: "code";

  error?: string;
}): string {
  const scopes = params.scope.split(/\s+/).filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>OAuth Authorize</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:#0b1220; color:#e5e7eb; margin:0; padding:24px; }
    .card { max-width: 760px; margin: 0 auto; background:#111827; border:1px solid #1f2937; border-radius:14px; padding:18px; }
    h1 { font-size: 18px; margin:0 0 6px; }
    .muted { color:#9ca3af; font-size: 13px; }
    .row { display:flex; gap:16px; flex-wrap:wrap; margin-top:14px; }
    .col { flex:1 1 280px; }
    label { display:block; font-size: 13px; color:#cbd5e1; margin: 10px 0 6px; }
    input { width:100%; padding:10px 12px; border-radius:10px; border:1px solid #334155; background:#0b1220; color:#e5e7eb; }
    ul { margin: 8px 0 0 18px; color:#e5e7eb; }
    .buttons { display:flex; gap:10px; margin-top:16px; }
    button { padding:10px 12px; border-radius:12px; border:1px solid transparent; cursor:pointer; font-weight:600; }
    .allow { background:#22c55e; color:#052e16; }
    .deny { background:#111827; border-color:#334155; color:#e5e7eb; }
    .err { margin-top: 12px; background:#7f1d1d; color:#fee2e2; padding:10px 12px; border-radius:12px; border:1px solid #991b1b; }
    code { color:#93c5fd; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize access</h1>
    <div class="muted">
      App: <b>${escapeHtml(params.clientName)}</b>
      <br/>
      Resource: <code>${escapeHtml(params.resource)}</code>
    </div>

    ${
      params.error
        ? `<div class="err">${escapeHtml(params.error)}</div>`
        : ""
    }

    <div class="row">
      <div class="col">
        <h2 style="font-size:14px;margin:12px 0 6px;">Requested scopes</h2>
        <ul>
          ${scopes.map((s) => `<li><code>${escapeHtml(s)}</code></li>`).join("")}
        </ul>
      </div>

      <div class="col">
        <h2 style="font-size:14px;margin:12px 0 6px;">Login</h2>

        <form method="POST" action="/oauth2/authorize">
          <input type="hidden" name="response_type" value="${escapeHtml(params.response_type)}" />
          <input type="hidden" name="client_id" value="${escapeHtml(params.client_id)}" />
          <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirect_uri)}" />
          <input type="hidden" name="scope" value="${escapeHtml(params.scope)}" />
          <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
          <input type="hidden" name="code_challenge" value="${escapeHtml(params.code_challenge)}" />
          <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.code_challenge_method)}" />
          <input type="hidden" name="resource" value="${escapeHtml(params.resource)}" />

          <label>Username</label>
          <input name="username" autocomplete="username" placeholder="alex" />

          <label>Password</label>
          <input name="password" type="password" autocomplete="current-password" placeholder="password" />

          <div class="buttons">
            <button class="allow" type="submit" name="decision" value="allow">Allow</button>
            <button class="deny" type="submit" name="decision" value="deny">Deny</button>
          </div>

          <div class="muted" style="margin-top:10px;">
            Demo user: <code>alex</code> / <code>password</code>
          </div>
        </form>
      </div>
    </div>
  </div>
</body>
</html>`;
}