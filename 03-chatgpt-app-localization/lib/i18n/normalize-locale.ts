import { SUPPORTED_LOCALES, type SupportedLocale } from "./supported-locales";

const ALIASES: Record<string, SupportedLocale> = {
  en: "en-US",
  "en-us": "en-US",
  "en_us": "en-US",

  ru: "ru-RU",
  "ru-ru": "ru-RU",
  "ru_ru": "ru-RU",

  de: "de-DE",
  "de-de": "de-DE",
  "de_de": "de-DE",
};

export function normalizeLocale(
  input: string | null | undefined
): { locale: SupportedLocale; isFallback: boolean } {
  const raw = (input ?? "").trim();
  if (!raw) return { locale: "en-US", isFallback: true };

  const key = raw.replace(/_/g, "-").toLowerCase();

  const alias = ALIASES[key];
  if (alias) return { locale: alias, isFallback: false };

  const supported = SUPPORTED_LOCALES.find((l) => l.toLowerCase() === key);
  if (supported) return { locale: supported, isFallback: false };

  return { locale: "en-US", isFallback: true };
}