import type { CompareRow, CompareRowKey, CompareViewModel, JetDetails, JetId } from "./jets.types";

type Metric = {
  key: CompareRowKey;
  label: string;
  higherIsBetter: boolean;
  weight: number;
};

const METRICS: Metric[] = [
  { key: "rangeKm", label: "Range (km)", higherIsBetter: true, weight: 0.45 },
  { key: "priceEstimateUsd", label: "Price (USD)", higherIsBetter: false, weight: 0.30 },
  { key: "seats", label: "Seats", higherIsBetter: true, weight: 0.20 },
  { key: "speedKmh", label: "Speed (km/h)", higherIsBetter: true, weight: 0.05 },
];

function normalize(values: Record<JetId, number>, higherIsBetter: boolean): Record<JetId, number> {
  const nums = Object.values(values);
  const min = Math.min(...nums);
  const max = Math.max(...nums);

  if (min === max) {
    return Object.fromEntries(Object.keys(values).map((id) => [id, 0.5]));
  }

  return Object.fromEntries(
    Object.entries(values).map(([id, x]) => {
      const t = (x - min) / (max - min);
      return [id, higherIsBetter ? t : 1 - t];
    })
  );
}

function fmtUsdShort(usd: number) {
  const m = usd / 1_000_000;
  return m >= 1 ? `$${Math.round(m)}M` : `$${Math.round(usd).toLocaleString()}`;
}

export function compareJetsToViewModel(jets: JetDetails[]): CompareViewModel {
  const ids = jets.map((j) => j.id);

  const rows: CompareRow[] = METRICS.map((m) => ({
    key: m.key,
    label: m.label,
    higherIsBetter: m.higherIsBetter,
    values: Object.fromEntries(jets.map((j) => [j.id, j[m.key]])),
  }));

  const normalized: Record<CompareRowKey, Record<JetId, number>> = Object.fromEntries(
    METRICS.map((m) => {
      const row = rows.find((r) => r.key === m.key)!;
      return [m.key, normalize(row.values, m.higherIsBetter)];
    })
  ) as any;

  const scores: Record<JetId, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const m of METRICS) {
    for (const id of ids) {
      scores[id] += normalized[m.key][id] * m.weight;
    }
  }

  const bestPickId = ids.reduce((best, id) => (scores[id] > scores[best] ? id : best), ids[0]);
  const best = jets.find((j) => j.id === bestPickId)!;

  const ranked = METRICS.map((m) => {
    const bestNorm = normalized[m.key][bestPickId];
    const others = ids.filter((id) => id !== bestPickId).map((id) => normalized[m.key][id]);
    const avgOther = others.reduce((a, b) => a + b, 0) / Math.max(1, others.length);
    return { metric: m, advantage: bestNorm - avgOther };
  }).sort((a, b) => b.advantage - a.advantage);

  const top = ranked.filter((x) => x.advantage > 0.05).slice(0, 4);
  const picked = (top.length >= 2 ? top : ranked.slice(0, 2)).slice(0, 5);

  const reasons = picked.map(({ metric }) => {
    switch (metric.key) {
      case "rangeKm":
        return `Best range in this set (${best.rangeKm.toLocaleString()} km).`;
      case "priceEstimateUsd":
        return `Most cost-effective option (~${fmtUsdShort(best.priceEstimateUsd)}).`;
      case "seats":
        return `Highest capacity (${best.seats} seats).`;
      case "speedKmh":
        return `Fastest cruise speed (${best.speedKmh} km/h).`;
    }
  });

  return {
    ids,
    jets: jets.map((j) => ({ id: j.id, title: j.title, imageUrl: j.imageUrl, orderUrl: j.orderUrl })),
    rows,
    bestPickId,
    reasons,
  };
}