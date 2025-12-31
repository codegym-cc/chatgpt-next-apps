import { baseURL } from "@/baseUrl";
import { jetsCatalog } from "./jets.data";
import type { CompareViewModel, Jet, JetCard, JetDetails } from "./jets.types";
import type { JetSearchInput } from "./jetSearch";
import { searchJetsInCatalog } from "./jetSearch";
import { compareJetsToViewModel } from "./jetCompare";

function abs(path: string) {
  return new URL(path, baseURL).toString();
}

function toCard(jet: Jet): JetCard {
  return {
    id: jet.id,
    title: jet.title,
    summary: jet.summary,
    tags: jet.tags,
    rangeKm: jet.rangeKm,
    seats: jet.seats,
    priceEstimateUsd: jet.priceEstimateUsd,
    imageUrl: abs(jet.imagePath),
  };
}

function toDetails(jet: Jet): JetDetails {
  return {
    id: jet.id,
    title: jet.title,
    manufacturer: jet.manufacturer,
    category: jet.category,
    description: jet.description,
    rangeKm: jet.rangeKm,
    seats: jet.seats,
    speedKmh: jet.speedKmh,
    priceEstimateUsd: jet.priceEstimateUsd,
    tags: jet.tags,
    imageUrl: abs(jet.imagePath),
    docsUrl: jet.docsUrl,
    orderUrl: jet.orderUrl,
  };
}

export function searchJets(input: JetSearchInput): JetCard[] {
  const found = searchJetsInCatalog(jetsCatalog, input);
  return found.map(toCard);
}

export function getJet(id: string): JetDetails {
  const jet = jetsCatalog.find((j) => j.id === id);
  if (!jet) throw new Error(`Unknown jet id: ${id}`);
  return toDetails(jet);
}

export function compareJets(ids: string[]): CompareViewModel {
  const details = ids.map(getJet);
  return compareJetsToViewModel(details);
}