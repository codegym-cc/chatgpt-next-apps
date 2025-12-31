export const SCOPES_SUPPORTED = ["profile:read", "notes:read", "notes:write"] as const;
export type SupportedScope = (typeof SCOPES_SUPPORTED)[number];

export function parseScopeParam(scope: string | undefined | null): string[] {
  return (scope ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeScopes(scopes: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(scopes).filter(Boolean))).sort();
}

export function formatScopeParam(scopes: Iterable<string>): string {
  return normalizeScopes(scopes).join(" ");
}

export function isSubsetOfSupportedScopes(requestedScopes: string[]): boolean {
  const supported = new Set<string>(SCOPES_SUPPORTED);
  return requestedScopes.every((s) => supported.has(s));
}

export function scopeClaimToSet(scopeClaim: unknown): Set<string> {
  if (typeof scopeClaim !== "string") return new Set();
  return new Set(parseScopeParam(scopeClaim));
}

export function hasAllScopes(granted: Set<string>, required: readonly string[]): boolean {
  return required.every((s) => granted.has(s));
}