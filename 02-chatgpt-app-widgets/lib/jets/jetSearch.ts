import type { Jet } from "./jets.types";

export type JetSort = "price_asc" | "price_desc" | "range_desc" | "seats_desc";

export type JetSearchInput = {
  query: string;
  rangeKmMin?: number;
  seatsMin?: number;
  priceUsdMax?: number;
  sort?: JetSort;
  limit?: number;
};

const STOP = new Set(["jet", "jets", "private", "business", "plane", "aircraft", "a", "the", "for"]);

function tokenize(query: string): string[] {
  const raw = query
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((t) => t.trim())
    .filter(Boolean);

  return raw.filter((t) => !STOP.has(t));
}

function scoreJet(jet: Jet, tokens: string[]): number {
  if (!tokens.length) return 0;

  const hay = [
    jet.title,
    jet.manufacturer,
    jet.category,
    jet.summary,
    jet.description,
    jet.tags.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  return tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
}

function bySort(sort: JetSort) {
  switch (sort) {
    case "price_desc":
      return (a: Jet, b: Jet) => b.priceEstimateUsd - a.priceEstimateUsd;
    case "range_desc":
      return (a: Jet, b: Jet) => b.rangeKm - a.rangeKm;
    case "seats_desc":
      return (a: Jet, b: Jet) => b.seats - a.seats;
    case "price_asc":
    default:
      return (a: Jet, b: Jet) => a.priceEstimateUsd - b.priceEstimateUsd;
  }
}

export function searchJetsInCatalog(catalog: Jet[], input: JetSearchInput): Jet[] {
  const sort = input.sort ?? "price_asc";
  const limit = input.limit ?? 5;
  const tokens = tokenize(input.query);

  let items = catalog
    .filter((j) => (input.rangeKmMin ? j.rangeKm >= input.rangeKmMin : true))
    .filter((j) => (input.seatsMin ? j.seats >= input.seatsMin : true))
    .filter((j) => (input.priceUsdMax ? j.priceEstimateUsd <= input.priceUsdMax : true));

  const sortCmp = bySort(sort);

  if (tokens.length) {
    const scored = items
      .map((jet) => ({ jet, score: scoreJet(jet, tokens) }))
      .filter((x) => x.score > 0);

    scored.sort((a, b) => (b.score - a.score) || sortCmp(a.jet, b.jet));
    items = scored.map((x) => x.jet);
  } else {
    items = [...items].sort(sortCmp);
  }

  return items.slice(0, limit);
}