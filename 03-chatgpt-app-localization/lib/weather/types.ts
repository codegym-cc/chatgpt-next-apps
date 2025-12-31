import type { SupportedLocale } from "@/lib/i18n/supported-locales";

export type Units = "metric" | "imperial";
export type LocationUsed = "input" | "userLocation" | "fallback";

export type ResolvedContext = {
  placeResolved: string;
  localeUsed: SupportedLocale;
  locationUsed: LocationUsed;
  timezoneUsed: string;
  unitsUsed: Units;

  coordinatesUsed?: { lat: number; lon: number };
  countryCodeUsed?: string;
};

export type Banner = { kind: "info" | "warning"; message: string };

export type WeatherDayKey = "current" | "next";
export type PartOfDay = "morning" | "day" | "evening" | "night";

export type WeatherDayStructuredContent = {
  kind: "weather_day";
  resolvedContext: ResolvedContext;
  banners?: Banner[];

  day: {
    key: WeatherDayKey;
    dateIso: string;
    summary: {
      conditionText: string;
      temp: {
        current?: number;
        min: number;
        max: number;
        feelsLike?: number;
      };
      wind: {
        speed: number;
        directionDeg?: number;
      };
      precipitationChance?: number;
    };

    slots: Array<{
      partOfDay: PartOfDay;
      timeIso: string;
      temp: number;
      conditionText: string;
      precipitationChance?: number;
    }>;
  };

  generatedAtIso: string;
};

export type WeatherWeekStructuredContent = {
  kind: "weather_week";
  resolvedContext: ResolvedContext;
  banners?: Banner[];

  days: Array<{
    dateIso: string;
    minTemp: number;
    maxTemp: number;
    conditionText: string;
    precipitationChance?: number;
  }>;

  generatedAtIso: string;
};

export type ToolErrorCode =
  | "INVALID_LOCALE"
  | "LOCATION_UNRESOLVED"
  | "PROVIDER_UNAVAILABLE";

export type ToolErrorContent = {
  code: ToolErrorCode;
  message: string;
  hint?: string;
};

export type ToolErrorStructuredContent = {
  kind: "tool_error";
  resolvedContext: ResolvedContext;
  banners?: Banner[];
  generatedAtIso: string;
  error: ToolErrorContent;
};

export type WeatherToolStructuredContent =
  | WeatherDayStructuredContent
  | WeatherWeekStructuredContent
  | ToolErrorStructuredContent;