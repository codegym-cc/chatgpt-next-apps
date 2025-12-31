import {z} from "zod";
import {JSDOM} from "jsdom";
import {McpServer, ResourceMetadata} from "@modelcontextprotocol/sdk/server/mcp.js";
import {createMcpHandler} from "mcp-handler";
import {baseURL} from "@/baseUrl";
import {compareJets, getJet, searchJets} from "@/lib/jets/jetService";

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

export class McpGateway {
    private explorer?: ContentWidget;
    private compare?: ContentWidget;

    constructor(private readonly server: McpServer) {
    }

    public async initialize(): Promise<void> {
        const htmlExplorer = await this.getAppsSdkCompatibleHtml(baseURL, "/explorer");
        const htmlCompare = await this.getAppsSdkCompatibleHtml(baseURL, "/compare");

        this.explorer = {
            id: "jets_explorer",
            title: "Private Jet Explorer",
            templateUri: "ui://widget/jets-explorer.html",
            invoking: "Loading jets...",
            invoked: "Jets ready",
            html: htmlExplorer,
            description: "Browse private jets: list + details + compare selection.",
            widgetDomain: baseURL,
        };

        this.compare = {
            id: "jets_compare",
            title: "Compare Jets",
            templateUri: "ui://widget/jets-compare.html",
            invoking: "Comparing jets...",
            invoked: "Comparison ready",
            html: htmlCompare,
            description: "Compare selected jets and get a best pick + reasons.",
            widgetDomain: baseURL,
        };
    }

    public registerResources(): void {
        const explorer = this.requireWidget("explorer");
        const compare = this.requireWidget("compare");

        for (const widget of [explorer, compare]) {
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
                async (uri) => ({
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
                                        baseURL
                                    ],
                                    resource_domains: [
                                        baseURL,
                                        "https://persistent.oaistatic.com",
                                        "https://commons.wikimedia.org",
                                        "https://upload.wikimedia.org",
                                        "https://fonts.googleapis.com",
                                        "https://fonts.gstatic.com",
                                    ],
                                },
                            },
                        },
                    ],
                })
            );
        }
    }

    public registerTools(): void {
        const explorer = this.requireWidget("explorer");
        const compare = this.requireWidget("compare");

        const searchInput = z.object({
            query: z.string().describe("What kind of jet the user wants (free text)."),
            rangeKmMin: z.number().optional().describe("Minimum range in km."),
            seatsMin: z.number().optional().describe("Minimum seat count."),
            priceUsdMax: z.number().optional().describe("Max estimated price in USD."),
            sort: z
                .enum(["price_asc", "price_desc", "range_desc", "seats_desc"])
                .optional()
                .describe("Sort mode (default: price_asc)."),
            limit: z.number().int().min(1).max(20).optional().describe("How many jets to return (default: 5)."),
        });

        this.server.registerTool(
            "search_jet",
            {
                title: "Search private jets",
                description: "Search a small demo catalog of private jets and return compact cards for Explorer list.",
                inputSchema: searchInput,
                _meta: this.widgetMeta(explorer),
                annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
            },
            async (args) => {
                const items = searchJets({
                    query: args.query,
                    rangeKmMin: args.rangeKmMin,
                    seatsMin: args.seatsMin,
                    priceUsdMax: args.priceUsdMax,
                    sort: args.sort ?? "price_asc",
                    limit: args.limit ?? 5,
                });

                return {
                    content: [{type: "text", text: `Found ${items.length} jets.`}],
                    structuredContent: {items},
                    _meta: this.widgetMeta(explorer),
                };
            }
        );

        this.server.registerTool(
            "get_jet",
            {
                title: "Get jet details",
                description: "Get compact details for a single jet by id (for Explorer details panel).",
                inputSchema: z.object({id: z.string().describe("Returned by search_jet() tool.")}),
                _meta: this.widgetMeta(explorer),
                annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
            },
            async ({id}) => {
                const details = getJet(id);

                return {
                    content: [{type: "text", text: `Loaded details for ${details.title}.`}],
                    structuredContent: details,
                    _meta: this.widgetMeta(explorer),
                };
            }
        );

        this.server.registerTool(
            "compare_jets",
            {
                title: "Compare jets",
                description: "Compare 2–5 jets and return a ready-to-render table + best pick + 2–5 short reasons.",
                inputSchema: z.object({
                    ids: z.array(z.string()).min(2).max(5).describe("Returned by search_jet() tool.")
                }),
                _meta: this.widgetMeta(compare),
                annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
            },
            async ({ids}) => {
                const vm = compareJets(ids);

                return {
                    content: [{type: "text", text: `Compared ${vm.ids.length} jets.`}],
                    structuredContent: vm,
                    _meta: this.widgetMeta(compare),
                };
            }
        );
    }

    private requireWidget(which: "explorer" | "compare"): ContentWidget {
        const widget = which === "explorer" ? this.explorer : this.compare;
        if (!widget) throw new Error("McpGateway not initialized. Call initialize() first.");
        return widget;
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

const handler = createMcpHandler(async (server) => {
    const gateway = new McpGateway(server);
    await gateway.initialize();
    gateway.registerResources();
    gateway.registerTools();
});

export const GET = handler;
export const POST = handler;