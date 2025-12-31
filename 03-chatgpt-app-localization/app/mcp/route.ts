import { z } from "zod";
import { JSDOM } from "jsdom";
import { McpServer, ResourceMetadata } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "mcp-handler";
import { baseURL } from "@/baseUrl";
import { resolveContext, type OpenAIUserLocation } from "@/lib/location/resolve-location";
import { createWeatherService } from "@/lib/weather/weather-service";
import type { ToolErrorCode, ToolErrorStructuredContent } from "@/lib/weather/types";
import { serverT, toolError } from "@/lib/i18n/server-t";

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
  private htmlDay = "";
  private htmlWeek = "";

  private day?: ContentWidget;
  private week?: ContentWidget;

  private readonly weather = createWeatherService();

  constructor(private readonly server: McpServer) {}

  public async initialize(): Promise<void> {
    this.htmlDay = await this.getAppsSdkCompatibleHtml(baseURL, "/widgets/day");
    this.htmlWeek = await this.getAppsSdkCompatibleHtml(baseURL, "/widgets/week");

    this.day = {
      id: "weather_day_widget",
      title: "Weather — Day",
      templateUri: "ui://widget/weather_day.html",
      invoking: "Loading day forecast...",
      invoked: "Day forecast ready",
      html: this.htmlDay,
      description: "Day forecast (demo: locale + location → context → weather VM).",
      widgetDomain: baseURL,
    };

    this.week = {
      id: "weather_week_widget",
      title: "Weather — Week",
      templateUri: "ui://widget/weather_week.html",
      invoking: "Loading week forecast...",
      invoked: "Week forecast ready",
      html: this.htmlWeek,
      description: "Week forecast (demo: locale + location → context → weather VM).",
      widgetDomain: baseURL,
    };
  }

  public registerResources(): void {
    const day = this.requireWidget("day");
    const week = this.requireWidget("week");

    for (const widget of [day, week]) {
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
        })
      );
    }
  }

  public registerTools(): void {
    const day = this.requireWidget("day");
    const week = this.requireWidget("week");

    const weatherDayInput = z.object({
      locale: z.string().min(1).describe("BCP-47 locale: en-US | ru-RU | de-DE."),
      day: z.enum(["current", "next"]).describe("current = today, next = tomorrow."),
      location: z.string().optional().describe("Optional location, e.g. 'Berlin, DE'."),
    });

    const weatherWeekInput = z.object({
      locale: z.string().min(1).describe("BCP-47 locale: en-US | ru-RU | de-DE."),
      location: z.string().optional().describe("Optional location, e.g. 'Berlin, DE'."),
    });

    this.server.registerTool(
      "weather_day",
      {
        title: "Weather (day)",
        description: "Returns day forecast view-model (localized + location-aware).",
        inputSchema: weatherDayInput,
        _meta: this.widgetMeta(day),
        annotations: { destructiveHint: false, openWorldHint: false, readOnlyHint: true },
      },
      async (rawArgs, extra) => {
        const parsed = weatherDayInput.safeParse(rawArgs);
        if (!parsed.success) {
          return this.errorResult(day, "INVALID_LOCALE", rawArgs);
        }

        const args = parsed.data;
        const metaUserLocation = (extra as any)?._meta?.["openai/userLocation"] as
          | OpenAIUserLocation
          | undefined;

        const ctx = resolveContext({
          localeInput: args.locale,
          locationInput: args.location,
          metaUserLocation,
        });

        try {
          const vm = await this.weather.weatherDay({
            locale: ctx.resolvedContext.localeUsed,
            day: args.day,
            context: ctx.resolvedContext,
            banners: ctx.banners,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: serverT(ctx.resolvedContext.localeUsed, "tool.weather_day.text", {
                  place: ctx.resolvedContext.placeResolved,
                }),
              },
            ],
            structuredContent: vm,
            _meta: this.widgetMeta(day),
          };
        } catch {
          return this.errorResult(day, "PROVIDER_UNAVAILABLE", args, metaUserLocation);
        }
      }
    );

    this.server.registerTool(
      "weather_week",
      {
        title: "Weather (week)",
        description: "Returns 7-day forecast view-model (localized + location-aware).",
        inputSchema: weatherWeekInput,
        _meta: this.widgetMeta(week),
        annotations: { destructiveHint: false, openWorldHint: false, readOnlyHint: true },
      },
      async (rawArgs, extra) => {
        const parsed = weatherWeekInput.safeParse(rawArgs);
        if (!parsed.success) {
          return this.errorResult(week, "INVALID_LOCALE", rawArgs);
        }

        const args = parsed.data;
        const metaUserLocation = (extra as any)?._meta?.["openai/userLocation"] as
          | OpenAIUserLocation
          | undefined;

        const ctx = resolveContext({
          localeInput: args.locale,
          locationInput: args.location,
          metaUserLocation,
        });

        try {
          const vm = await this.weather.weatherWeek({
            locale: ctx.resolvedContext.localeUsed,
            context: ctx.resolvedContext,
            banners: ctx.banners,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: serverT(ctx.resolvedContext.localeUsed, "tool.weather_week.text", {
                  place: ctx.resolvedContext.placeResolved,
                }),
              },
            ],
            structuredContent: vm,
            _meta: this.widgetMeta(week),
          };
        } catch {
          return this.errorResult(week, "PROVIDER_UNAVAILABLE", args, metaUserLocation);
        }
      }
    );
  }

  private requireWidget(which: "day" | "week"): ContentWidget {
    const widget = which === "day" ? this.day : this.week;
    if (!widget) throw new Error("McpGateway not initialized. Call initialize() first.");
    return widget;
  }

  private errorResult(
    widget: ContentWidget,
    code: ToolErrorCode,
    rawArgs: unknown,
    metaUserLocation?: OpenAIUserLocation
  ) {
    const localeInput = typeof (rawArgs as any)?.locale === "string" ? (rawArgs as any).locale : "";
    const locationInput =
      typeof (rawArgs as any)?.location === "string" ? (rawArgs as any).location : undefined;

    const ctx = resolveContext({ localeInput, locationInput, metaUserLocation });
    const err: ToolErrorStructuredContent = {
      kind: "tool_error",
      resolvedContext: ctx.resolvedContext,
      banners: ctx.banners,
      generatedAtIso: new Date().toISOString(),
      error: toolError(ctx.resolvedContext.localeUsed, code),
    };

    const content = [{ type: "text" as const, text: err.error.message }];

    return {
      isError: true,
      content: content,
      structuredContent: err,
      _meta: this.widgetMeta(widget),
    };
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
}

const handler = createMcpHandler(async (server) => {
  const gateway = new McpGateway(server);
  await gateway.initialize();
  gateway.registerResources();
  gateway.registerTools();
});

export const GET = handler;
export const POST = handler;