import { normalizeLocale } from "@/lib/i18n/normalize-locale";
import { serverT } from "@/lib/i18n/server-t";
import type { Banner, LocationUsed, ResolvedContext, Units } from "@/lib/weather/types";

export type OpenAIUserLocation = {
  city?: string;
  region?: string;
  country?: string;
  timezone?: string;
  latitude?: string;
  longitude?: string;
};

type KnownPlace = {
  re: RegExp;
  placeResolved: string;
  countryCode: string;
  timezone: string;
};

const FALLBACK_PLACE: KnownPlace = {
  re: /^$/,
  placeResolved: "Berlin, Germany",
  countryCode: "DE",
  timezone: "Europe/Berlin",
};

const KNOWN_PLACES: KnownPlace[] = [
  { re: /berlin/i, placeResolved: "Berlin, Germany", countryCode: "DE", timezone: "Europe/Berlin" },
  { re: /munich|münchen/i, placeResolved: "Munich, Germany", countryCode: "DE", timezone: "Europe/Berlin" },
  { re: /hamburg/i, placeResolved: "Hamburg, Germany", countryCode: "DE", timezone: "Europe/Berlin" },

  { re: /moscow|москва/i, placeResolved: "Moscow, Russia", countryCode: "RU", timezone: "Europe/Moscow" },
  {
    re: /saint\s*petersburg|st\s*petersburg|спб|питер/i,
    placeResolved: "Saint Petersburg, Russia",
    countryCode: "RU",
    timezone: "Europe/Moscow",
  },

  {
    re: /new\s*york|nyc/i,
    placeResolved: "New York, United States",
    countryCode: "US",
    timezone: "America/New_York",
  },
  {
    re: /san\s*francisco|\bsf\b/i,
    placeResolved: "San Francisco, United States",
    countryCode: "US",
    timezone: "America/Los_Angeles",
  },
  {
    re: /los\s*angeles|\bla\b/i,
    placeResolved: "Los Angeles, United States",
    countryCode: "US",
    timezone: "America/Los_Angeles",
  },
];

function normalizeCountryCode(country?: string): string | undefined {
  const c = (country ?? "").trim();
  if (!c) return undefined;
  return c.length === 2 ? c.toUpperCase() : c.toUpperCase().slice(0, 2);
}

function buildFromUserLocation(meta: OpenAIUserLocation): string {
  const city = (meta.city ?? "").trim();
  const region = (meta.region ?? "").trim();
  const country = (meta.country ?? "").trim();

  const left = [city, region].filter(Boolean).join(", ");
  return [left, country].filter(Boolean).join(", ");
}

function findKnownPlace(query: string): KnownPlace | null {
  const q = query.trim();
  if (!q) return null;
  return KNOWN_PLACES.find((p) => p.re.test(q)) ?? null;
}

function parseCoords(meta?: OpenAIUserLocation): { lat: number; lon: number } | undefined {
  if (!meta) return undefined;

  const lat = meta.latitude != null ? Number(meta.latitude) : NaN;
  const lon = meta.longitude != null ? Number(meta.longitude) : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  return { lat, lon };
}

function sanitizeTimeZone(timeZone?: string): string {
  const tz = (timeZone ?? "").trim();
  if (!tz) return "UTC";

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    return "UTC";
  }
}

export type ResolveContextInput = {
  localeInput: string;
  locationInput?: string | null;
  metaUserLocation?: OpenAIUserLocation;
};

export function resolveContext(input: ResolveContextInput): {
  resolvedContext: ResolvedContext;
  banners?: Banner[];
} {
  const { locale: localeUsed, isFallback: localeFallback } = normalizeLocale(input.localeInput);

  const banners: Banner[] = [];

  if (localeFallback && input.localeInput?.trim()) {
    banners.push({
      kind: "info",
      message: serverT(localeUsed, "banner.localeFallback", {
        requested: input.localeInput.trim(),
        resolved: localeUsed,
      }),
    });
  }

  const locationTrimmed = (input.locationInput ?? "").trim();
  const fromUser = input.metaUserLocation ? buildFromUserLocation(input.metaUserLocation).trim() : "";

  let locationUsed: LocationUsed = "fallback";
  let locationQuery = "";

  if (locationTrimmed) {
    locationUsed = "input";
    locationQuery = locationTrimmed;
  } else if (fromUser) {
    locationUsed = "userLocation";
    locationQuery = fromUser;
  } else {
    locationUsed = "fallback";
    locationQuery = FALLBACK_PLACE.placeResolved;
    banners.push({ kind: "warning", message: serverT(localeUsed, "banner.fallbackLocation") });
  }

  const known = findKnownPlace(locationQuery);

  const placeResolved = (known?.placeResolved ?? locationQuery) || FALLBACK_PLACE.placeResolved;
  const countryCodeUsed = known?.countryCode ?? normalizeCountryCode(input.metaUserLocation?.country);
  const timezoneUsed = known?.timezone ?? sanitizeTimeZone(input.metaUserLocation?.timezone);

  const unitsUsed: Units = countryCodeUsed === "US" ? "imperial" : "metric";
  if (!countryCodeUsed) {
    banners.push({ kind: "info", message: serverT(localeUsed, "banner.unknownCountry") });
  }

  const coordinatesUsed = parseCoords(input.metaUserLocation);

  const resolvedContext: ResolvedContext = {
    placeResolved,
    localeUsed,
    locationUsed,
    timezoneUsed,
    unitsUsed,
    ...(countryCodeUsed ? { countryCodeUsed } : {}),
    ...(coordinatesUsed ? { coordinatesUsed } : {}),
  };

  return { resolvedContext, banners: banners.length ? banners : undefined };
}