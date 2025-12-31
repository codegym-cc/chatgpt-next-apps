import {z} from "zod";
import {JSDOM} from "jsdom";
import {McpServer, type ResourceMetadata} from "@modelcontextprotocol/sdk/server/mcp.js";
import {createMcpHandler} from "mcp-handler";
import {baseURL} from "@/baseUrl";

import {
    TOOL_POLICIES,
    buildJsonRpcToolAuthError,
    buildWwwAuthenticate,
    corsPreflight,
    corsify,
    getAuthContext,
    getToolPolicy,
    runWithAuthContext,
    verifyBearerFromRequest,
    type JsonRpcId,
    type VerifiedAuthContext,
} from "./auth";

import {addNote, listNotes, publicTeaserNotes} from "./notesStore";

export const dynamic = "force-dynamic";

type ContentWidget = {
    id: string;
    title: string;
    templateUri: string;
    invoking: string;
    invoked: string;
    html: string;
    description: string;
    widgetDomain: string;
};

class McpGateway {
    private readonly widgetHostUrl: string = baseURL;
    private htmlWidget: string = "";
    private widget?: ContentWidget;

    constructor(private readonly server: McpServer) {
    }

    public async initialize(): Promise<void> {
        this.htmlWidget = await this.getAppsSdkCompatibleHtml(this.widgetHostUrl, "/");

        this.widget = {
            id: "auth_show",
            templateUri: "ui://widget/auth_show.html",
            title: "Auth Demo Widget",
            description: "OAuth demo widget (not connected / connected, notes UI)",
            invoking: "Opening widget...",
            invoked: "Widget opened",
            html: this.htmlWidget,
            widgetDomain: baseURL,
        };
    }

    public registerResources(): void {
        const widget = this.requireWidget();

        this.server.registerResource(
            widget.id,
            widget.templateUri,
            {
                title: widget.title,
                description: widget.description,
                mimeType: "text/html+skybridge",
                _meta: {
                    "openai/widgetDescription": widget.description,
                    "openai/widgetPrefersBorder": true,
                },
            } as ResourceMetadata,
            async (uri) => {
                return {
                    contents: [
                        {
                            uri: uri.href,
                            mimeType: "text/html+skybridge",
                            text: widget.html,
                            _meta: {
                                "openai/widgetDescription": widget.description,
                                "openai/widgetPrefersBorder": true,
                                "openai/widgetDomain": widget.widgetDomain,
                                "openai/widgetCSP": {
                                    connect_domains: [baseURL],
                                    resource_domains: [
                                        baseURL,
                                        "https://persistent.oaistatic.com",
                                        "https://fonts.googleapis.com",
                                        "https://fonts.gstatic.com",
                                    ],
                                },
                            },
                        },
                    ],
                };
            }
        );
    }

    public registerTools(): void {
        const widget = this.requireWidget();

        // Tool 1 — auth_show (public)
        this.server.registerTool(
            widget.id,
            {
                title: widget.title,
                description: "Open the Auth Demo widget UI",
                inputSchema: z.object({}).describe("No inputs"),
                _meta: {
                    ...this.widgetMeta(widget),
                    securitySchemes: [{type: "noauth"}],
                },
                annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
            },
            async () => {
                return {
                    content: [{type: "text", text: "Auth Demo Widget"}],
                    structuredContent: {opened: true},
                    _meta: this.widgetMeta(widget),
                };
            }
        );

        // Tool 2 — auth_whoami (private: profile:read)
        this.server.registerTool(
            "auth_whoami",
            {
                title: "Who am I?",
                description: "Returns the current authenticated user identity",
                inputSchema: z.object({}).describe("No inputs"),
                _meta: {
                    securitySchemes: [{type: "oauth2", scopes: ["profile:read"]}],
                },
                annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
            } as any,
            async () => {
                const ctx = getAuthContext();
                // Should be non-null because the route-level guard enforces it
                if (!ctx) {
                    return {
                        isError: true,
                        content: [{type: "text", text: "Internal error: missing auth context."}],
                    };
                }

                return {
                    content: [{type: "text", text: `Connected as ${ctx.name ?? ctx.sub}`}],
                    structuredContent: {
                        userId: ctx.sub,
                        displayName: ctx.name ?? ctx.sub,
                    },
                };
            }
        );

        // Tool 3 — notes_list (private: notes:read)
        this.server.registerTool(
            "notes_list",
            {
                title: "List notes",
                description: "List private notes for the current user",
                inputSchema: z.object({}).describe("No inputs"),
                _meta: {
                    securitySchemes: [{type: "oauth2", scopes: ["notes:read"]}],
                },
                annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
            },
            async () => {
                const ctx = getAuthContext();
                if (!ctx) {
                    return {
                        isError: true,
                        content: [{type: "text", text: "Internal error: missing auth context."}],
                    };
                }

                const items = listNotes(ctx.sub);
                return {
                    content: [{type: "text", text: `Found ${items.length} notes.`}],
                    structuredContent: {items},
                };
            }
        );

        // Tool 4 — notes_add (private: notes:write)
        this.server.registerTool(
            "notes_add",
            {
                title: "Add note",
                description: "Add a private note for the current user",
                inputSchema: z
                    .object({
                        title: z.string().min(1),
                        body: z.string().min(1),
                    })
                    .describe("Note input"),
                _meta: {
                    securitySchemes: [{type: "oauth2", scopes: ["notes:write"]}],
                },
                annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: false},
            },
            async (args: any) => {
                const ctx = getAuthContext();
                if (!ctx) {
                    return {
                        isError: true,
                        content: [{type: "text", text: "Internal error: missing auth context."}],
                    };
                }

                const title = String(args?.title ?? "");
                const body = String(args?.body ?? "");

                const result = addNote(ctx.sub, {title, body});

                return {
                    content: [{type: "text", text: `Added note ${result.noteId}`}],
                    structuredContent: result,
                };
            }
        );

        // Tool 5 — notes_teaser (mixed auth: optional)
        this.server.registerTool(
            "notes_teaser",
            {
                title: "Notes teaser",
                description:
                    "Optional auth demo: without token returns public teaser; with token+notes:read returns private notes",
                inputSchema: z.object({}).describe("No inputs"),
                _meta: {
                    securitySchemes: [
                        {type: "noauth"},
                        {type: "oauth2", scopes: ["notes:read"]},
                    ],
                },
                annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
            },
            async () => {
                const ctx = getAuthContext();

                if (ctx && ctx.scopes.has("notes:read")) {
                    const items = listNotes(ctx.sub);
                    return {
                        content: [{type: "text", text: `Private notes for ${ctx.sub}`}],
                        structuredContent: {
                            mode: "private",
                            userId: ctx.sub,
                            items,
                        },
                    };
                }

                return {
                    content: [{type: "text", text: "Public notes teaser"}],
                    structuredContent: {
                        mode: "public",
                        items: publicTeaserNotes(),
                    },
                };
            }
        );
    }

    private requireWidget(): ContentWidget {
        if (!this.widget) throw new Error("McpGateway is not initialized. Call initialize() first.");
        return this.widget;
    }

    private async getAppsSdkCompatibleHtml(baseUrl: string, pathname: string): Promise<string> {
        const res = await fetch(`${baseUrl}${pathname}`);
        const html = await res.text();
        return this.makeImgUrlsAbsolute(html, baseUrl);
    }

    private makeImgUrlsAbsolute(html: string, baseUrl: string): string {
        const dom = new JSDOM(html);
        const doc = dom.window.document;

        for (const img of Array.from(doc.querySelectorAll("img[src]"))) {
            const src = img.getAttribute("src");
            if (!src) continue;
            try {
                img.setAttribute("src", new URL(src, baseUrl).toString());
            } catch {
            }
        }

        for (const img of Array.from(doc.querySelectorAll("img[srcset]"))) {
            const srcset = img.getAttribute("srcset");
            if (!srcset) continue;

            const newSrcset = srcset
                .split(",")
                .map((item) => {
                    const trimmed = item.trim();
                    if (!trimmed) return "";

                    const [urlPart, descriptor] = trimmed.split(/\s+/, 2);
                    try {
                        const absUrl = new URL(urlPart, baseUrl).toString();
                        return descriptor ? `${absUrl} ${descriptor}` : absUrl;
                    } catch {
                        return trimmed;
                    }
                })
                .filter(Boolean)
                .join(", ");

            img.setAttribute("srcset", newSrcset);
        }

        return dom.serialize();
    }

    private widgetMeta(widget: ContentWidget): Record<string, unknown> {
        return {
            "openai/outputTemplate": widget.templateUri,
            "openai/toolInvocation/invoking": widget.invoking,
            "openai/toolInvocation/invoked": widget.invoked,
            "openai/widgetAccessible": true,
            "openai/resultCanProduceWidget": true,
        } as const;
    }
}

/**
 * Underlying MCP handler (SDK-based)
 */
const underlyingHandler = createMcpHandler(async (server) => {
    const mcpServer = new McpGateway(server);
    await mcpServer.initialize();
    mcpServer.registerResources();
    mcpServer.registerTools();
});

/**
 * Helper: Identify tools/call and tool name for auth gating
 */
function parseJsonRpc(reqBody: any): { id: JsonRpcId; method?: string; toolName?: string } {
    const id = (reqBody && "id" in reqBody ? (reqBody.id as any) : null) as JsonRpcId;
    const method = typeof reqBody?.method === "string" ? reqBody.method : undefined;

    if (method === "tools/call") {
        const toolName = typeof reqBody?.params?.name === "string" ? reqBody.params.name : undefined;
        return {id, method, toolName};
    }

    return {id, method};
}

function authErrorResponse(params: {
    status: 401 | 403;
    id: JsonRpcId;
    wwwAuthenticate: string;
    message: string;
}): Response {
    const body = buildJsonRpcToolAuthError({
        id: params.id,
        wwwAuthenticate: params.wwwAuthenticate,
        message: params.message,
    });

    return corsify(
        new Response(JSON.stringify(body), {
            status: params.status,
            headers: {
                "Content-Type": "application/json",
                "WWW-Authenticate": params.wwwAuthenticate,
                "Cache-Control": "no-store",
            },
        })
    );
}

/**
 * Next.js Route Handlers
 * - Wrap POST to enforce OAuth on a per-tool basis for tools/call
 * - Return HTTP 401/403 + WWW-Authenticate AND tool-level _meta["mcp/www_authenticate"]
 */
export async function OPTIONS() {
    return corsPreflight();
}

export async function GET(req: Request) {
    // For GET handshake: we just pass-through with best-effort auth context
    const verified = verifyBearerFromRequest(req);
    const ctx = verified.status === "valid" ? verified.ctx : null;
    const res = await runWithAuthContext(ctx, () => underlyingHandler(req));
    return corsify(res);
}

export async function POST(req: Request) {
    // Clone to parse JSON without consuming the original body
    const clone = req.clone();
    let reqBody: any;

    try {
        reqBody = await clone.json();
    } catch {
        return corsify(
            new Response(JSON.stringify({error: "invalid_request", message: "Invalid JSON"}), {
                status: 400,
                headers: {"Content-Type": "application/json", "Cache-Control": "no-store"},
            })
        );
    }

    const {id, toolName} = parseJsonRpc(reqBody);

    // Verify token (if any)
    const verified = verifyBearerFromRequest(req);

    // Route-level auth gating only for tools/call (the PRD focuses on tool authorization)
    if (toolName) {
        const policy = getToolPolicy(toolName);

        // Unknown tool: let MCP SDK handle it
        if (policy) {
            // required tool
            if (policy.kind === "required") {
                if (verified.status === "none") {
                    const www = buildWwwAuthenticate({
                        scope: policy.requiredScopes.join(" "),
                        // Jam/ChatGPT tend to behave better if we signal "insufficient_scope" for "needs login".
                        error: "insufficient_scope",
                        error_description: "You need to login to continue",
                    });

                    return authErrorResponse({
                        status: 401,
                        id,
                        wwwAuthenticate: www,
                        message: "Authentication required: no access token provided.",
                    });
                }

                if (verified.status === "invalid") {
                    const www = buildWwwAuthenticate({
                        scope: policy.requiredScopes.join(" "),
                        error: "invalid_token",
                        error_description: "Token invalid or expired",
                    });
                    return authErrorResponse({
                        status: 401,
                        id,
                        wwwAuthenticate: www,
                        message: "Authentication required.",
                    });
                }

                // verified.valid => enforce scopes
                const ctx = verified.ctx;
                const missing = policy.requiredScopes.filter((s) => !ctx.scopes.has(s));
                if (missing.length > 0) {
                    const www = buildWwwAuthenticate({
                        scope: policy.requiredScopes.join(" "),
                        error: "insufficient_scope",
                        error_description: "Re-authorize to grant required access",
                    });
                    return authErrorResponse({
                        status: 403,
                        id,
                        wwwAuthenticate: www,
                        message: "Insufficient scope.",
                    });
                }
            }

            // optional tool strict rule:
            // if token provided but invalid => 401 (do NOT pretend public)
            if (policy.kind === "optional" && verified.status === "invalid") {
                const www = buildWwwAuthenticate({
                    scope: policy.optionalScopes.join(" "),
                    error: "invalid_token",
                    error_description: "Token invalid or expired",
                });
                return authErrorResponse({
                    status: 401,
                    id,
                    wwwAuthenticate: www,
                    message: "Authentication required.",
                });
            }

            // public tool: if token invalid, ignore and treat as anonymous (keeps widget accessible)
            // (ctx becomes null)
        }
    }

    let ctxForHandler: VerifiedAuthContext | null = null;
    if (verified.status === "valid") {
        ctxForHandler = verified.ctx;
    } else {
        // If invalid token and tool is public, we ignore (ctx=null).
        ctxForHandler = null;
    }

    const res = await runWithAuthContext(ctxForHandler, () => underlyingHandler(req));
    return corsify(res);
}