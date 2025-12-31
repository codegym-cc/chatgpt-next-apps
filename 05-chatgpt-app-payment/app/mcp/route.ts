import { z } from "zod";
import { JSDOM } from "jsdom";
import { McpServer, ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "mcp-handler";
import { baseURL } from "@/baseUrl";
import { catalogService, ProductNotFoundError } from "@/src/domain/catalog";
import {
  checkoutService,
  IdempotencyConflictError,
  OutOfStockError,
  SessionExpiredError,
  SessionNotFoundError,
} from "@/src/domain/checkout";

export const runtime = "nodejs";

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

type ToolErrorPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

// Keep a small local tool-result type to prevent literal widening ("text" -> string)
// and make try/catch branches structurally consistent with MCP CallToolResult.
type ToolTextContent = { type: "text"; text: string };

type McpToolResult = {
  content: ToolTextContent[];
  structuredContent?: Record<string, unknown>; // <-- was unknown
  _meta?: Record<string, unknown>;
  isError?: boolean;
};

function toolOk(structuredContent: Record<string, unknown>,extraMeta?: Record<string, unknown>,text?: string): McpToolResult {
  const result: McpToolResult = {
    content: text ? [{ type: "text", text }] : [],
    structuredContent,
  };
  if (extraMeta) result._meta = extraMeta;
  return result;
}

function toolError(code: string, message: string, extraMeta?: Record<string, unknown>): McpToolResult {
  const payload: ToolErrorPayload = {
    ok: false,
    error: { code, message },
  };

  const result: McpToolResult = {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: payload as unknown as Record<string, unknown>, // or just make payload a Record<...> upfront
  };

  if (extraMeta) result._meta = extraMeta;
  return result;
}

function mapError(err: unknown) {
  if (err instanceof ProductNotFoundError) return { code: err.code, message: err.message };
  if (err instanceof OutOfStockError) return { code: err.code, message: err.message };
  if (err instanceof IdempotencyConflictError) return { code: err.code, message: err.message };
  if (err instanceof SessionNotFoundError) return { code: err.code, message: err.message };
  if (err instanceof SessionExpiredError) return { code: err.code, message: err.message };

  return { code: "INTERNAL_ERROR", message: "Internal error" };
}

export class PaymentMcpGateway {
  private readonly widgetHostUrl: string = baseURL;
  private htmlWidget: string = "";
  private widget?: ContentWidget;

  constructor(private readonly server: McpServer) {}

  public async initialize(): Promise<void> {
    this.htmlWidget = await this.getAppsSdkCompatibleHtml(this.widgetHostUrl, "/");

    this.widget = {
      id: "payment_widget",
      templateUri: "ui://widget/payment.html",
      title: "Payment Demo",
      description: "Mini shop: catalog → cart → checkout session → requestCheckout fallback → hosted checkout → confirm",
      invoking: "Opening shop…",
      invoked: "Shop opened",
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
            "openai/widgetPrefersBorder": true
          }
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
                      "https://placehold.co",
                      "https://persistent.oaistatic.com",
                      "https://fonts.googleapis.com",
                      "https://fonts.gstatic.com"
                    ]
                  }
                }
              }
            ]
          };
        }
    );
  }

  public registerTools(): void {
    const widget = this.requireWidget();

    // 1) payment_show (opens the widget)
    this.server.registerTool(
        "payment_show",
        {
          title: "Open Payment Demo",
          description: "Open the Payment Demo shop widget",
          inputSchema: z.object({}),
          _meta: this.widgetMeta(widget),
          annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
        },
        async (): Promise<McpToolResult> => {
          try {
            return toolOk(
                { ok: true, widget: { id: "payment" } },
                this.widgetMeta(widget),
                "Opening Payment Demo widget…"
            );
          } catch {
            return toolError("INTERNAL_ERROR", "Failed to render widget", this.widgetMeta(widget));
          }
        }
    );

    // 2) store_list_products (readOnlyHint)
    const listProductsSchema = z.object({
      query: z.string().optional(),
      category: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(10)
    });

    this.server.registerTool(
        "store_list_products",
        {
          title: "List products",
          description: "Return products for the catalog",
          inputSchema: listProductsSchema,
          annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
        },
        async (args):Promise<McpToolResult> => {
          const parsed = listProductsSchema.safeParse(args ?? {});
          if (!parsed.success) {
            return toolError("VALIDATION_ERROR", "Invalid input");
          }

          const { query, category, limit } = parsed.data;
          const products = catalogService.list({ query, category, limit });

          return toolOk({
            items: products.map((p) => ({
              sku: p.sku,
              title: p.title,
              price: p.price,
              currency: p.currency,
              imageUrl: p.imageUrl,
              inStock: p.inStock
            }))
          });
        }
    );

    // 3) store_get_product (readOnlyHint)
    const getProductSchema = z.object({ sku: z.string().min(1) });

    this.server.registerTool(
        "store_get_product",
        {
          title: "Get product",
          description: "Get one product by sku",
          inputSchema: getProductSchema,
          annotations: {destructiveHint: false, openWorldHint: false, readOnlyHint: true},
        },
        async (args) => {
          const parsed = getProductSchema.safeParse(args ?? {});
          if (!parsed.success) {
            return toolError("VALIDATION_ERROR", "Invalid sku");
          }

          const sku = parsed.data.sku;
          const product = catalogService.getBySku(sku);
          if (!product) {
            return toolError("PRODUCT_NOT_FOUND", `Product not found: ${sku}`);
          }

          return toolOk({
            sku: product.sku,
            title: product.title,
            description: product.description,
            price: product.price,
            currency: product.currency,
            imageUrl: product.imageUrl,
            inStock: product.inStock,
            sellerUrl: product.sellerUrl
          });
        }
    );

    // 4) checkout_create_session (destructiveHint; idempotencyKey required)
    const createSessionSchema = z.object({
      lineItems: z
          .array(
              z.object({
                sku: z.string().min(1),
                quantity: z.number().int().min(1).max(10)
              })
          )
          .min(1),
      idempotencyKey: z.string().min(8)
    });

    this.server.registerTool(
        "checkout_create_session",
        {
          title: "Create checkout session",
          description: "Create a checkout session from SKU + quantity (idempotent by idempotencyKey)",
          inputSchema: createSessionSchema,
          annotations: {destructiveHint: true, openWorldHint: false, readOnlyHint: false},
        },
        async (args) => {
          const parsed = createSessionSchema.safeParse(args ?? {});
          if (!parsed.success) {
            return toolError("VALIDATION_ERROR", "Invalid lineItems/quantity/idempotencyKey");
          }

          try {
            const session = checkoutService.createSession({
              lineItems: parsed.data.lineItems,
              idempotencyKey: parsed.data.idempotencyKey
            });

            return toolOk({
              checkoutSessionId: session.id,
              status: "created",
              currency: session.currency,
              total: session.total,
              checkoutUrl: session.checkoutUrl,
              lineItems: session.lineItems.map((li) => ({ sku: li.sku, quantity: li.quantity })),
              requestCheckoutPayload: checkoutService.buildRequestCheckoutPayload(session)
            });
          } catch (e) {
            const mapped = mapError(e);
            return toolError(mapped.code, mapped.message);
          }
        }
    );

    // 5) checkout_confirm (destructiveHint; confirm is idempotent)
    const confirmSchema = z.object({ checkoutSessionId: z.string().min(1) });

    this.server.registerTool(
        "checkout_confirm",
        {
          title: "Confirm checkout",
          description: "Confirm the checkout session (demo payment). Idempotent.",
          inputSchema: confirmSchema,
          annotations: {destructiveHint: true, openWorldHint: false, readOnlyHint: false},
        },
        async (args) => {
          const parsed = confirmSchema.safeParse(args ?? {});
          if (!parsed.success) {
            return toolError("VALIDATION_ERROR", "Invalid checkoutSessionId");
          }

          try {
            const res = checkoutService.confirm(parsed.data.checkoutSessionId);
            return toolOk(res);
          } catch (e) {
            const mapped = mapError(e);
            return toolError(mapped.code, mapped.message);
          }
        }
    );

    // 6) complete_checkout (recommended; ACP-aligned callback)
    const completeSchema = z.object({
      checkoutSessionId: z.string().min(1),
      buyer: z.record(z.string(), z.unknown()).optional(),
      payment_data: z.record(z.string(), z.unknown()).optional(),
    });

    this.server.registerTool(
        "complete_checkout",
        {
          title: "Complete checkout (Instant Checkout callback)",
          description: "ACP-aligned callback: finalizes an order idempotently (demo, no real charge).",
          inputSchema: completeSchema,
          annotations: {destructiveHint: true, openWorldHint: false, readOnlyHint: false},
        },
        async (args) => {
          const parsed = completeSchema.safeParse(args ?? {});
          if (!parsed.success) {
            return toolError("VALIDATION_ERROR", "Invalid input");
          }

          try {
            const confirmed = checkoutService.confirm(parsed.data.checkoutSessionId);
            const session = checkoutService.getSession(parsed.data.checkoutSessionId);

            return toolOk({
              id: session.id,
              status: "completed",
              currency: session.currency,
              order: {
                id: confirmed.orderId,
                checkout_session_id: session.id,
                permalink_url: session.checkoutUrl
              }
            });
          } catch (e) {
            const mapped = mapError(e);
            return toolError(mapped.code, mapped.message);
          }
        }
    );
  }

  private requireWidget(): ContentWidget {
    if (!this.widget) throw new Error("PaymentMcpGateway not initialized");
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
      } catch {}
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
      "openai/resultCanProduceWidget": true
    } as const;
  }
}

const handler = createMcpHandler(async (server) => {
  const gateway = new PaymentMcpGateway(server);
  await gateway.initialize();
  gateway.registerResources();
  gateway.registerTools();
});

export const GET = handler;
export const POST = handler;