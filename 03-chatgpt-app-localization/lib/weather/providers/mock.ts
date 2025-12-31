import type {
  ConditionCode,
  ProviderDayForecast,
  ProviderWeekForecast,
  WeatherProvider,
} from "../provider";
import type { PartOfDay } from "../types";

const PARTS: Array<{ partOfDay: PartOfDay; hour: number }> = [
  { partOfDay: "morning", hour: 8 },
  { partOfDay: "day", hour: 13 },
  { partOfDay: "evening", hour: 18 },
  { partOfDay: "night", hour: 23 },
];

const DAY_CONDITIONS: ConditionCode[] = ["clear", "cloudy", "light_rain", "rain", "thunder"];

type Ymd = { year: number; month: number; day: number };

export class MockWeatherProvider implements WeatherProvider {
  public async getDayForecast(args: {
    seed: string;
    date: Date;
    timeZone: string;
  }): Promise<ProviderDayForecast> {
    const timeZone = safeTimeZone(args.timeZone);
    const seed = args.seed ?? "";
    const date = args.date ?? new Date();

    const ymd = zonedYmd(date, timeZone);
    const stamp = Math.floor(date.getTime() / 86_400_000); // day number in UTC
    const h = hash(seed);

    const conditionCode = DAY_CONDITIONS[(h + stamp) % DAY_CONDITIONS.length];
    const precip = precipChance(conditionCode);

    // Metric baseline (Celsius) is deterministic by place + day.
    const baseC = 8 + (h % 12) + ((stamp + h) % 5) - 2;

    const tempMinC = round1(baseC - 3 - ((stamp + h) % 2));
    const tempMaxC = round1(baseC + 5 + ((stamp + h) % 3));
    const tempCurrentC = round1((tempMinC + tempMaxC) / 2 + 1);
    const feelsLikeC = round1(tempCurrentC - (precip > 0.3 ? 1.5 : 0));

    const windSpeedMps = round1(1.5 + ((h + stamp) % 7) * 0.6);
    const windDirectionDeg = (h * 13 + stamp * 7) % 360;

    const dateIso = zonedLocalTimeToUtcIso(timeZone, ymd, 12, 0);

    const slots = PARTS.map((p, idx) => {
      const delta = [-2, 1, -1, -3][idx] ?? 0;
      const slotConditionCode = slotCondition(conditionCode, idx);
      const slotPrecip = clamp01(precipChance(slotConditionCode) + idx * 0.03);

      return {
        partOfDay: p.partOfDay,
        timeIso: zonedLocalTimeToUtcIso(timeZone, ymd, p.hour, 0),
        tempC: round1(tempCurrentC + delta),
        conditionCode: slotConditionCode,
        precipitationChance: slotPrecip,
      };
    });

    return {
      dateIso,
      summary: {
        conditionCode,
        tempMinC,
        tempMaxC,
        tempCurrentC,
        feelsLikeC,
        windSpeedMps,
        windDirectionDeg,
        precipitationChance: precip,
      },
      slots,
    };
  }

  public async getWeekForecast(args: {
    seed: string;
    startDate: Date;
    timeZone: string;
  }): Promise<ProviderWeekForecast> {
    const days: ProviderWeekForecast["days"] = [];

    for (let i = 0; i < 7; i++) {
      const date = new Date(args.startDate.getTime() + i * 86_400_000);
      const d = await this.getDayForecast({ seed: args.seed, date, timeZone: args.timeZone });

      days.push({
        dateIso: d.dateIso,
        minTempC: d.summary.tempMinC,
        maxTempC: d.summary.tempMaxC,
        conditionCode: d.summary.conditionCode,
        precipitationChance: d.summary.precipitationChance,
      });
    }

    return { days };
  }
}

function safeTimeZone(timeZone: string): string {
  const tz = (timeZone ?? "").trim();
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}

function zonedYmd(date: Date, timeZone: string): Ymd {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "01";

  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
}

function zonedLocalTimeToUtcIso(timeZone: string, ymd: Ymd, hour: number, minute: number): string {
  return zonedLocalTimeToUtc(timeZone, ymd, hour, minute).toISOString();
}

/**
 * Minimal time zone conversion without extra deps.
 * Iterate twice to account for DST.
 */
function zonedLocalTimeToUtc(timeZone: string, ymd: Ymd, hour: number, minute: number): Date {
  // First guess: treat local time as UTC.
  let utc = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, hour, minute, 0));

  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(utc);

    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";

    const actual = {
      year: Number(get("year")),
      month: Number(get("month")),
      day: Number(get("day")),
      hour: Number(get("hour")),
      minute: Number(get("minute")),
    };

    const desiredAsUtc = Date.UTC(ymd.year, ymd.month - 1, ymd.day, hour, minute, 0);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0);

    utc = new Date(utc.getTime() + (desiredAsUtc - actualAsUtc));
  }

  return utc;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function precipChance(code: ConditionCode): number {
  switch (code) {
    case "clear":
      return 0.05;
    case "cloudy":
      return 0.15;
    case "light_rain":
      return 0.35;
    case "rain":
      return 0.6;
    case "thunder":
      return 0.8;
    case "snow":
      return 0.5;
    case "fog":
      return 0.2;
  }
}

function slotCondition(dayCode: ConditionCode, slotIndex: number): ConditionCode {
  if (dayCode === "rain" && slotIndex === 0) return "light_rain";
  if (dayCode === "clear" && slotIndex === 3) return "cloudy";
  return dayCode;
}