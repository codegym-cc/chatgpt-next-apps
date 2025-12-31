export type JetId = string;

export type JetCategory =
  | "very_light"
  | "light"
  | "midsize"
  | "super_midsize"
  | "heavy"
  | "ultra_long_range"
  | "utility";

export type Jet = {
  id: JetId;
  title: string;
  manufacturer: string;
  category: JetCategory;

  summary: string; // short for cards
  description: string; // short factual (1–3 sentences)

  rangeKm: number;
  seats: number;
  speedKmh: number;
  priceEstimateUsd: number;

  tags: string[];

  imagePath: string; // relative (public/)
  docsUrl: string;
  orderUrl: string;
};

export type JetCard = {
  id: JetId;
  title: string;
  summary: string;
  tags: string[];
  rangeKm: number;
  seats: number;
  priceEstimateUsd: number;
  imageUrl: string; // absolute
};

export type JetDetails = {
  id: JetId;
  title: string;
  manufacturer: string;
  category: JetCategory;
  description: string;

  rangeKm: number;
  seats: number;
  speedKmh: number;
  priceEstimateUsd: number;

  tags: string[];
  imageUrl: string; // absolute
  docsUrl: string;
  orderUrl: string;
};

export type CompareRowKey = "rangeKm" | "seats" | "priceEstimateUsd" | "speedKmh";

export type CompareRow = {
  key: CompareRowKey;
  label: string;
  higherIsBetter: boolean;
  values: Record<JetId, number>;
};

export type CompareJetHeader = {
  id: JetId;
  title: string;
  imageUrl: string;
  orderUrl: string;
};

export type CompareViewModel = {
  ids: JetId[];
  jets: CompareJetHeader[];
  rows: CompareRow[];
  bestPickId: JetId;
  reasons: string[];
};