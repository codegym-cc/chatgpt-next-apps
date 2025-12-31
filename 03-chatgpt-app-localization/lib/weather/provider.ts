import type { PartOfDay } from "./types";

export type ConditionCode =
  | "clear"
  | "cloudy"
  | "light_rain"
  | "rain"
  | "thunder"
  | "snow"
  | "fog";

export type ProviderDayForecast = {
  dateIso: string;
  summary: {
    conditionCode: ConditionCode;

    tempMinC: number;
    tempMaxC: number;
    tempCurrentC: number;
    feelsLikeC: number;

    windSpeedMps: number;
    windDirectionDeg: number;

    precipitationChance: number;
  };

  slots: Array<{
    partOfDay: PartOfDay;
    timeIso: string;
    tempC: number;
    conditionCode: ConditionCode;
    precipitationChance: number;
  }>;
};

export type ProviderWeekForecast = {
  days: Array<{
    dateIso: string;
    minTempC: number;
    maxTempC: number;
    conditionCode: ConditionCode;
    precipitationChance: number;
  }>;
};

export interface WeatherProvider {
  getDayForecast(args: { seed: string; date: Date; timeZone: string }): Promise<ProviderDayForecast>;
  getWeekForecast(args: {
    seed: string;
    startDate: Date;
    timeZone: string;
  }): Promise<ProviderWeekForecast>;
}