// Pure "which invite (if any) should /settings/invite reuse" decision,
// pulled out of the page component so it's directly unit-testable — a
// Server Component that reads cookies/Supabase can't be rendered via
// Vitest + React Testing Library (see the Home and Stash real-data-wiring
// tasks' own PRs for why), so the actual decision logic lives here instead
// of inline in page.tsx.

export interface InviteCandidate {
  code: string;
  expires_at: string | null;
}

/**
 * Picks the first still-usable invite from `candidates` (already filtered
 * by the caller to redeemed_at IS NULL — this function only judges
 * expiry), or null if none qualify and a new one should be created. A null
 * expires_at means "never expires" (AC #2's own reuse rule: "unless the
 * existing one is expired/redeemed").
 */
export function findReusableInvite(candidates: readonly InviteCandidate[], now: Date): InviteCandidate | null {
  return candidates.find((candidate) => candidate.expires_at === null || new Date(candidate.expires_at) > now) ?? null;
}
