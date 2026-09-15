import { redirect } from "next/navigation";
import { InvitePanel } from "@/components/invite-panel";
import { findReusableInvite } from "@/lib/invite-reuse";
import { createClient } from "@/server/db/server";

// Invite-partner UI: generate (or reuse) an invite code and display a
// shareable /join/[code] link. Plain direct reads/writes against the
// invites table — no RPC needed, since invites_insert's own RLS policy
// already allows a household member to insert a row scoped to their own
// household, and there's no cross-table invariant here the way
// move_item/delete_container/redeem_invite need one.
//
// Route choice: /settings/invite (documented per this task's AC — no
// existing settings surface, "/household/invite" was the other named
// option; picked /settings since a settings *section* is the more
// natural future home for account/household-level actions beyond just
// invites, whereas /household/invite reads as if it could only ever be
// this one thing).
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error("settings/invite: signed-in user has no household");
  }

  // Every not-yet-redeemed invite for this household — small (a handful at
  // most for a couple's app), so filtering expiry in JS (findReusableInvite)
  // rather than building a dynamic PostgREST .or() date-range filter keeps
  // this straightforward and unit-testable.
  const { data: candidates, error: candidatesError } = await supabase
    .from("invites")
    .select("code, expires_at")
    .eq("household_id", membership.household_id)
    .is("redeemed_at", null)
    .order("created_at", { ascending: false });

  if (candidatesError) {
    throw new Error(candidatesError.message);
  }

  const reusable = findReusableInvite(candidates, new Date());

  let code: string;
  if (reusable) {
    code = reusable.code;
  } else {
    // expires_at is left null (never expires) — the invites migration's
    // own comment calls expiry/rotation policy a placeholder to revisit
    // "when redeem_invite lands," and this task's AC doesn't specify one,
    // so no expiry is invented here.
    const { data: created, error: createError } = await supabase
      .from("invites")
      .insert({ household_id: membership.household_id, created_by: user.id })
      .select("code")
      .single();
    if (createError) {
      throw new Error(createError.message);
    }
    code = created.code;
  }

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Invite your partner</h1>
      <p className="text-[11.5px] text-mid">
        Share this code or link — anyone with it can join your household.
      </p>
      <InvitePanel code={code} />
    </main>
  );
}
