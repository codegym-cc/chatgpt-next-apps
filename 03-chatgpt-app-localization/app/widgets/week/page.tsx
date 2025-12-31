"use client";

import type {
    Banner,
    ResolvedContext,
    ToolErrorContent,
    WeatherToolStructuredContent,
    WeatherWeekStructuredContent,
} from "@/lib/weather/types";
import {WidgetI18nProvider} from "@/lib/ui/widget-i18n-provider";
import {useFormatter, useTranslations} from "next-intl";
import {useMaxHeight, useOpenAIGlobal, useWidgetProps} from "../../hooks";

const EMPTY_TOOL_OUTPUT: any = {};

export default function WeekWidgetPage() {
    const maxHeight = useMaxHeight() ?? undefined;

    const toolOutputRaw = useWidgetProps<any>(EMPTY_TOOL_OUTPUT);
    const openAiLocale = useOpenAIGlobal("locale");  // User system locale

    const toolInput = useOpenAIGlobal("toolInput") as any || {};      // Get user language/locale from toolInput

    const vm = toolOutputRaw as WeatherToolStructuredContent;
    const locale = toolInput.locale ?? openAiLocale ?? "en-US";

    return (
        <div
            className="w-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            style={{maxHeight}}
        >
            <WidgetI18nProvider locale={locale}>
                <WeekView vm={vm}/>
            </WidgetI18nProvider>
        </div>
    );
}

function WeekView({vm}: { vm: WeatherToolStructuredContent | null }) {
    const t = useTranslations();
    const fmt = useFormatter();

    if (!vm || vm === EMPTY_TOOL_OUTPUT) {
        return (
            <div className="p-4">
                <EmptyState
                    title={t("common.emptyToolOutputTitle")}
                    text={t("common.emptyToolOutputText")}
                />
            </div>
        );
    }

    if (vm.kind === "tool_error") {
        return (
            <div className="p-4 space-y-4">
                <ToolErrorCard error={vm.error}/>
                <Banners banners={vm.banners}/>
                <ContextBlock ctx={vm.resolvedContext}/>
            </div>
        );
    }

    if (vm.kind !== "weather_week") {
        return (
            <div className="p-4">
                <ToolErrorCard error={{code: "PROVIDER_UNAVAILABLE", message: t("toolError.title")}}/>
            </div>
        );
    }

    return <WeekWeather vm={vm} fmt={fmt}/>;
}

function WeekWeather({
                         vm,
                         fmt,
                     }: {
    vm: WeatherWeekStructuredContent;
    fmt: ReturnType<typeof useFormatter>;
}) {
    const t = useTranslations();

    const tz = vm.resolvedContext.timezoneUsed || "UTC";
    const units = vm.resolvedContext.unitsUsed;

    const tempUnit = units === "imperial" ? t("units.tempF") : t("units.tempC");

    const n0 = (n: number) => fmt.number(n, {maximumFractionDigits: 0});
    const pct = (n: number) => fmt.number(n, {style: "percent", maximumFractionDigits: 0});

    return (
        <div className="p-4 space-y-4">
            <header className="space-y-1">
                <div className="text-base font-semibold">{t("week.title")}</div>
                <div className="text-sm">{vm.resolvedContext.placeResolved}</div>
            </header>

            <Banners banners={vm.banners}/>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {vm.days.map((d) => (
                        <div key={d.dateIso} className="p-4 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <div className="text-sm font-semibold truncate">
                                    {fmt.dateTime(new Date(d.dateIso), {
                                        weekday: "short",
                                        month: "short",
                                        day: "2-digit",
                                        timeZone: tz,
                                    })}
                                </div>
                                <div className="mt-1 text-xs text-slate-700 dark:text-slate-200">{d.conditionText}</div>
                            </div>

                            <div className="text-right flex-shrink-0 text-xs text-slate-700 dark:text-slate-200">
                                <div className="font-mono">
                                    {n0(d.minTemp)}{tempUnit} – {n0(d.maxTemp)}{tempUnit}
                                </div>
                                {d.precipitationChance != null && (
                                    <div className="mt-1 text-slate-600 dark:text-slate-300">
                                        {pct(d.precipitationChance)}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                    {t("common.generatedAt")}:{" "}
                    <span className="font-mono">
            {fmt.dateTime(new Date(vm.generatedAtIso), {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: tz,
            })}
          </span>
                </div>
            </section>

            <ContextBlock ctx={vm.resolvedContext}/>
        </div>
    );
}

function Banners({banners}: { banners?: Banner[] }) {
    if (!banners?.length) return null;

    return (
        <div className="space-y-2">
            {banners.map((b, idx) => (
                <div
                    key={idx}
                    className={[
                        "rounded-xl border px-4 py-3 text-xs",
                        b.kind === "warning"
                            ? "border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200"
                            : "border-sky-200 dark:border-sky-900 bg-sky-50 dark:bg-sky-950/20 text-sky-900 dark:text-sky-200",
                    ].join(" ")}
                >
                    {b.message}
                </div>
            ))}
        </div>
    );
}

function ContextBlock({ctx}: { ctx: ResolvedContext }) {
    const t = useTranslations();

    return (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800">
                <div className="text-sm font-semibold">{t("context.title")}</div>
            </div>

            <div className="p-4 text-xs text-slate-700 dark:text-slate-200 space-y-1">
                <Row label={t("context.place")} value={ctx.placeResolved}/>
                <Row label={t("context.locale")} value={ctx.localeUsed}/>
                <Row
                    label={t("context.locationSource")}
                    value={t(`context.locationUsed.${ctx.locationUsed}`)}
                />
                <Row label={t("context.units")} value={t(`context.unitsUsed.${ctx.unitsUsed}`)}/>
                <Row label={t("context.timezone")} value={ctx.timezoneUsed}/>
                {ctx.countryCodeUsed && <Row label={t("context.country")} value={ctx.countryCodeUsed}/>}
            </div>
        </section>
    );
}

function Row({label, value}: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-3">
            <div className="text-slate-500 dark:text-slate-400">{label}</div>
            <div className="font-mono text-right">{value}</div>
        </div>
    );
}

function ToolErrorCard({error}: { error: ToolErrorContent }) {
    const t = useTranslations();

    return (
        <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-4">
            <div className="text-sm font-semibold text-red-900 dark:text-red-200">
                {t("toolError.title")}
            </div>
            <div className="mt-1 text-sm text-red-800 dark:text-red-200">{error.message}</div>
            {error.hint && <div className="mt-1 text-xs text-red-700 dark:text-red-300">{error.hint}</div>}

            <button
                className="mt-3 cursor-pointer text-xs rounded-lg bg-red-600 text-white px-3 py-1.5"
                onClick={() => window.location.reload()}
            >
                {t("common.retry")}
            </button>
        </div>
    );
}

function EmptyState({title, text}: { title: string; text: string }) {
    return (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-4">
            <div className="text-sm font-semibold">{title}</div>
            <div className="mt-1 text-xs text-slate-600 dark:text-slate-300">{text}</div>
        </div>
    );
}