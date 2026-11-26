import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { householdTitle, readHouseholdIdentity } from "@/lib/household-title";
import { HOUSEHOLD_FULL_MESSAGE } from "@/lib/limit-errors";
import { LIMIT_ERROR_CODES } from "@/lib/limits";

export { HOUSEHOLD_FULL_MESSAGE };

/** `householdName` is the household's title (householdTitle), null if it can't be read. */
export type RedeemInviteResult = { ok: true; householdName: string | null } | { ok: false; error: string };

async function titleOf(supabase: SupabaseClient<Database>, householdId: string): Promise<string | null> {
  const identity = await readHouseholdIdentity(supabase, householdId);
  return identity === null ? null : householdTitle(identity);
}

/**
 * Redeems an invite code and resolves the joined household's title —
 * shared by JoinInviteFlow (the already-signed-in case) and
 * SignUpForm/SignInForm (the sign-up/sign-in-through-an-invite case), so
 * there's exactly one place that knows how to turn a code into "you're in,
 * here's the household's name" or a specific error.
 *
 * Safe to call more than once for the same code by the same caller — e.g.
 * once from the sign-up/sign-in step (see those components' `invite` prop)
 * and once more here if /join/[code] re-renders authenticated. redeem_invite
 * itself rejects a SECOND redemption of an already-consumed code
 * unconditionally (see that migration's own comment) — but a rejection
 * checked against a follow-up read of the SAME invite row disambiguates
 * "I'm the one who just redeemed this" from "someone else already did, or
 * it's invalid": invites' own RLS only lets an `authenticated` caller SELECT
 * a row they're already a household member of (invites_select requires
 * is_household_member) — so a readable row after that specific failure IS
 * proof this caller is already a member of its household, not evidence of
 * a stranger's redemption. Any other rejection (not found, expired, or
 * genuinely someone else's redemption) leaves that row invisible under RLS,
 * so the fallback read finds nothing and the original error is reported.
 */
export async function redeemInviteAndGetHouseholdName(
  supabase: SupabaseClient<Database>,
  code: string,
): Promise<RedeemInviteResult> {
  const { data, error } = await supabase.rpc("redeem_invite", { p_code: code });

  if (!error) {
    return { ok: true, householdName: await titleOf(supabase, data.household_id) };
  }

  if (error.code === LIMIT_ERROR_CODES.householdFull) {
    return { ok: false, error: HOUSEHOLD_FULL_MESSAGE };
  }

  const { data: alreadyMemberInvite } = await supabase
    .from("invites")
    .select("household_id")
    .eq("code", code)
    .maybeSingle();

  if (alreadyMemberInvite) {
    return { ok: true, householdName: await titleOf(supabase, alreadyMemberInvite.household_id) };
  }

  return { ok: false, error: error.message };
}
