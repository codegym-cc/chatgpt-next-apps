"use client";

import { NextIntlClientProvider, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type MessagesResponse = {
  locale: string;
  messages: Record<string, unknown>;
};

type State =
  | { status: "loading" }
  | {
      status: "ready";
      requestedLocale: string;
      resolvedLocale: string;
      messages: Record<string, unknown>;
    }
  | { status: "error"; requestedLocale: string; error: string };

export function WidgetI18nProvider(props: { locale: string; children: React.ReactNode }) {
  const requestedLocale = (props.locale ?? "").trim() || "en-US";
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setState({ status: "loading" });

      try {
        const res = await fetch(`/api/i18n/messages?locale=${encodeURIComponent(requestedLocale)}`, {
          cache: "no-store",
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = (await res.json()) as MessagesResponse;
        if (cancelled) return;

        setState({
          status: "ready",
          requestedLocale,
          resolvedLocale: data.locale || "en-US",
          messages: (data.messages ?? {}) as Record<string, unknown>,
        });
      } catch (e) {
        if (cancelled) return;
        setState({
          status: "error",
          requestedLocale,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [requestedLocale]);

  if (state.status === "loading") {
    return <TranslationsLoading />;
  }

  if (state.status === "error") {
    return (
      <NextIntlClientProvider
        locale="en-US"
        messages={{}}
        onError={() => {}}
        getMessageFallback={(info: any) => `[missing:${info.key}]`}
      >
        <TranslationsError requestedLocale={state.requestedLocale} error={state.error} />
        {props.children}
      </NextIntlClientProvider>
    );
  }

  return (
    <NextIntlClientProvider
      locale={state.resolvedLocale}
      messages={state.messages}
      onError={() => {}}
      getMessageFallback={(info: any) => `[missing:${info.key}]`}
    >
      {shouldShowLocaleFallbackBanner(state.requestedLocale, state.resolvedLocale) && (
        <LocaleFallbackBanner requested={state.requestedLocale} resolved={state.resolvedLocale} />
      )}
      {props.children}
    </NextIntlClientProvider>
  );
}

function shouldShowLocaleFallbackBanner(requested: string, resolved: string): boolean {
  if (requested === resolved) return false;
  return !isSupportedOrAlias(requested);
}

function isSupportedOrAlias(locale: string): boolean {
  const key = locale.trim().replace(/_/g, "-").toLowerCase();
  return key === "en" || key === "en-us" || key === "ru" || key === "ru-ru" || key === "de" || key === "de-de";
}

function TranslationsLoading() {
  return (
    <div className="p-4">
      <div className="h-4 w-40 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
      <div className="mt-3 h-3 w-64 rounded bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
      <div className="mt-2 h-3 w-56 rounded bg-slate-200/70 dark:bg-slate-800/70 animate-pulse" />
    </div>
  );
}

function TranslationsError(props: { requestedLocale: string; error: string }) {
  const t = useTranslations();

  return (
    <div className="p-4">
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-3">
        <div className="text-sm font-semibold text-red-900 dark:text-red-200">
          {t("common.errorTitle")}
        </div>
        <div className="mt-1 text-xs text-red-800 dark:text-red-200">{props.error}</div>
        <div className="mt-1 text-[11px] text-red-700 dark:text-red-300">
          locale: <code className="font-mono">{props.requestedLocale}</code>
        </div>
      </div>
    </div>
  );
}

function LocaleFallbackBanner(props: { requested: string; resolved: string }) {
  const t = useTranslations();

  return (
    <div className="px-4 pt-4">
      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-200">
        {t("common.localeFallback", { requested: props.requested, resolved: props.resolved })}
      </div>
    </div>
  );
}