import type { ToolErrorCode, ToolErrorContent } from "@/lib/weather/types";
import type { SupportedLocale } from "./supported-locales";

type Vars = Record<string, string | number>;

const STRINGS: Record<SupportedLocale, Record<string, string>> = {
  "en-US": {
    "condition.clear": "Clear sky",
    "condition.cloudy": "Cloudy",
    "condition.light_rain": "Light rain",
    "condition.rain": "Rain",
    "condition.thunder": "Thunderstorm",
    "condition.snow": "Snow",
    "condition.fog": "Fog",

    "banner.fallbackLocation": "No location provided. Using a default location.",
    "banner.unknownCountry": "Country is unknown. Using metric units.",
    "banner.localeFallback": "Locale {requested} is not supported. Using {resolved}.",

    "tool.weather_day.text": "Day forecast for {place}.",
    "tool.weather_week.text": "7-day forecast for {place}.",

    "error.INVALID_LOCALE.message": "Invalid locale.",
    "error.INVALID_LOCALE.hint": "Use en-US, ru-RU, or de-DE.",

    "error.LOCATION_UNRESOLVED.message": "Unable to resolve location.",
    "error.LOCATION_UNRESOLVED.hint": "Try a city and country, like “Berlin, DE”.",

    "error.PROVIDER_UNAVAILABLE.message": "Weather provider unavailable.",
    "error.PROVIDER_UNAVAILABLE.hint": "Try again later.",
  },

  "ru-RU": {
    "condition.clear": "Ясно",
    "condition.cloudy": "Облачно",
    "condition.light_rain": "Небольшой дождь",
    "condition.rain": "Дождь",
    "condition.thunder": "Гроза",
    "condition.snow": "Снег",
    "condition.fog": "Туман",

    "banner.fallbackLocation": "Локация не указана. Используем локацию по умолчанию.",
    "banner.unknownCountry": "Страна не определена. Используем метрические единицы.",
    "banner.localeFallback": "Локаль {requested} не поддержана. Используем {resolved}.",

    "tool.weather_day.text": "Прогноз на день: {place}.",
    "tool.weather_week.text": "Прогноз на 7 дней: {place}.",

    "error.INVALID_LOCALE.message": "Некорректная локаль.",
    "error.INVALID_LOCALE.hint": "Используйте en-US, ru-RU или de-DE.",

    "error.LOCATION_UNRESOLVED.message": "Не удалось определить локацию.",
    "error.LOCATION_UNRESOLVED.hint": "Попробуйте город и страну, например «Berlin, DE».",

    "error.PROVIDER_UNAVAILABLE.message": "Провайдер погоды недоступен.",
    "error.PROVIDER_UNAVAILABLE.hint": "Попробуйте позже.",
  },

  "de-DE": {
    "condition.clear": "Klar",
    "condition.cloudy": "Bewölkt",
    "condition.light_rain": "Leichter Regen",
    "condition.rain": "Regen",
    "condition.thunder": "Gewitter",
    "condition.snow": "Schnee",
    "condition.fog": "Nebel",

    "banner.fallbackLocation": "Kein Ort angegeben. Standardort wird verwendet.",
    "banner.unknownCountry": "Land unbekannt. Metrische Einheiten werden verwendet.",
    "banner.localeFallback": "Locale {requested} wird nicht unterstützt. Verwende {resolved}.",

    "tool.weather_day.text": "Tagesvorhersage für {place}.",
    "tool.weather_week.text": "7‑Tage‑Vorhersage für {place}.",

    "error.INVALID_LOCALE.message": "Ungültige Locale.",
    "error.INVALID_LOCALE.hint": "Verwende en-US, ru-RU oder de-DE.",

    "error.LOCATION_UNRESOLVED.message": "Ort konnte nicht aufgelöst werden.",
    "error.LOCATION_UNRESOLVED.hint": "Versuche Stadt und Land, z. B. „Berlin, DE“.",

    "error.PROVIDER_UNAVAILABLE.message": "Wetterdienst nicht verfügbar.",
    "error.PROVIDER_UNAVAILABLE.hint": "Bitte später erneut versuchen.",
  },
};

function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined ? `{${key}}` : String(v);
  });
}

export function serverT(locale: SupportedLocale, key: string, vars?: Vars): string {
  const template = STRINGS[locale]?.[key] ?? STRINGS["en-US"]?.[key] ?? `[missing:${key}]`;
  return format(template, vars);
}

export function toolError(locale: SupportedLocale, code: ToolErrorCode): ToolErrorContent {
  const message = serverT(locale, `error.${code}.message`);
  const hint = serverT(locale, `error.${code}.hint`);
  return hint.startsWith("[missing:") ? { code, message } : { code, message, hint };
}