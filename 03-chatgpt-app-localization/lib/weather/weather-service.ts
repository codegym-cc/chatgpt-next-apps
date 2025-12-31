import type { SupportedLocale } from "@/lib/i18n/supported-locales";
import { serverT } from "@/lib/i18n/server-t";
import type { WeatherProvider } from "./provider";
import { MockWeatherProvider } from "./providers/mock";
import type {
  Banner,
  ResolvedContext,
  Units,
  WeatherDayKey,
  WeatherDayStructuredContent,
  WeatherWeekStructuredContent,
} from "./types";

export class WeatherService {
  constructor(private readonly provider: WeatherProvider) {}

  public async weatherDay(args: {
    locale: SupportedLocale;
    day: WeatherDayKey;
    context: ResolvedContext;
    banners?: Banner[];
  }): Promise<WeatherDayStructuredContent> {
    const now = new Date();
    const date = new Date(now.getTime() + (args.day === "next" ? 86_400_000 : 0));

    const base = await this.provider.getDayForecast({
      seed: args.context.placeResolved,
      date,
      timeZone: args.context.timezoneUsed,
    });

    const units = args.context.unitsUsed;
    const condition = (code: string) => serverT(args.locale, `condition.${code}`);

    return {
      kind: "weather_day",
      resolvedContext: args.context,
      banners: args.banners,

      day: {
        key: args.day,
        dateIso: base.dateIso,
        summary: {
          conditionText: condition(base.summary.conditionCode),
          temp: {
            current: convTemp(base.summary.tempCurrentC, units),
            min: convTemp(base.summary.tempMinC, units),
            max: convTemp(base.summary.tempMaxC, units),
            feelsLike: convTemp(base.summary.feelsLikeC, units),
          },
          wind: {
            speed: convWind(base.summary.windSpeedMps, units),
            directionDeg: Math.round(base.summary.windDirectionDeg),
          },
          precipitationChance: clamp01(base.summary.precipitationChance),
        },

        slots: base.slots.map((s) => ({
          partOfDay: s.partOfDay,
          timeIso: s.timeIso,
          temp: convTemp(s.tempC, units),
          conditionText: condition(s.conditionCode),
          precipitationChance: clamp01(s.precipitationChance),
        })),
      },

      generatedAtIso: new Date().toISOString(),
    };
  }

  public async weatherWeek(args: {
    locale: SupportedLocale;
    context: ResolvedContext;
    banners?: Banner[];
  }): Promise<WeatherWeekStructuredContent> {
    const base = await this.provider.getWeekForecast({
      seed: args.context.placeResolved,
      startDate: new Date(),
      timeZone: args.context.timezoneUsed,
    });

    const units = args.context.unitsUsed;
    const condition = (code: string) => serverT(args.locale, `condition.${code}`);

    return {
      kind: "weather_week",
      resolvedContext: args.context,
      banners: args.banners,

      days: base.days.map((d) => ({
        dateIso: d.dateIso,
        minTemp: convTemp(d.minTempC, units),
        maxTemp: convTemp(d.maxTempC, units),
        conditionText: condition(d.conditionCode),
        precipitationChance: clamp01(d.precipitationChance),
      })),

      generatedAtIso: new Date().toISOString(),
    };
  }
}

export function createWeatherService(provider: WeatherProvider = new MockWeatherProvider()) {
  return new WeatherService(provider);
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function convTemp(celsius: number, units: Units): number {
  const n = units === "imperial" ? cToF(celsius) : celsius;
  return round1(n);
}

function convWind(mps: number, units: Units): number {
  const n = units === "imperial" ? mpsToMph(mps) : mps;
  return round1(n);
}

function cToF(c: number) {
  return (c * 9) / 5 + 32;
}

function mpsToMph(mps: number) {
  return mps * 2.236936;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}