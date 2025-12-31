import {z} from "zod";
import {JSDOM} from "jsdom";
import {McpServer, ResourceMetadata} from "@modelcontextprotocol/sdk/server/mcp.js";
import {createMcpHandler} from "mcp-handler";
import {baseURL} from "@/baseUrl";

export type ContentWidget = {
    id: string;
    title: string;
    templateUri: string;
    invoking: string;
    invoked: string;
    html: string;
    description: string;
    widgetDomain: string;
};

export class McpGateway {
    private readonly widgetHostUrl: string = baseURL;
    private widget?: ContentWidget;

    constructor(private readonly server: McpServer) {
    }

    public async initialize(): Promise<void> {
        const htmlWidget = await this.getAppsSdkCompatibleHtml(this.widgetHostUrl, "/");

        this.widget = {
            id: "hello_world",
            templateUri: "ui://widget/hello_world.html",
            title: "HelloWorld Widget",
            description: "Displays the HelloWorld widget",
            invoking: "Loading widget...",
            invoked: "Widget loaded",
            html: htmlWidget,
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
                                    connect_domains: [
                                        baseURL,
                                        "https://codegym.cc",
                                    ],
                                    resource_domains: [
                                        baseURL,
                                        "https://codegym.cc",
                                        "https://cdn.tailwindcss.com",
                                        "https://persistent.oaistatic.com",
                                        "https://fonts.googleapis.com",
                                        "https://fonts.gstatic.com"
                                    ]
                                }
                            },
                        },
                    ],
                };
            }
        );
    }

    public registerTools(): void {
        const widget = this.requireWidget();

        this.server.registerTool(
            widget.id,
            {
                title: widget.title,
                description: "Returns HelloWorld widget",
                inputSchema: z.object({}).describe("No inputs"),
                _meta: this.widgetMeta(widget),
                annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
            },
            async () => {
                return {
                    content: [{type: "text", text: "HelloWorld MCP-tool"}],
                    structuredContent: {timestamp: new Date().toISOString()},
                    _meta: this.widgetMeta(widget),
                };
            }
        );
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
}


/**
 * Next.JS MCP Handler
 */

const handler = createMcpHandler(async (server) => {

    const mcpServer: McpGateway = new McpGateway(server);
    await mcpServer.initialize()
    mcpServer.registerResources();
    mcpServer.registerTools();

});

export const GET = handler;
export const POST = handler;