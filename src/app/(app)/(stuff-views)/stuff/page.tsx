import Link from "next/link";
import { redirect } from "next/navigation";
import { GuidedOnboarding } from "@/components/guided-onboarding";
import { HouseholdSetupRetry } from "@/components/household-setup-retry";
import { StuffSearchResults } from "@/components/stuff-search-results";
import { RegisterStuffView } from "@/components/stuff-views-shell";
import { buttonClassName } from "@/components/ui/button";
import { createClient } from "@/server/db/server";
import { loadStuffEntries } from "@/server/services/stuff-entries";

// Wireframe screen 02, "Home — everything (default)": the full item list,
// each row showing its full location path. The heading, search field, Stash
// and the "All (n)" / "By place" chips above it belong to the layout both
// views share (StuffViewsShell, see ../layout.tsx), so they stay on screen
// when you switch to Browse. loading.tsx covers this page's reads.
//
// Real household data: items/locations are read directly via PostgREST,
// RLS-scoped to the caller's household — no route handler for this plain
// read, per the settled architecture.
export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // A signed-out visitor never reaches this page: src/proxy.ts sends them
  // to /sign-in?next=/stuff first. The proxy only checks the cookie's
  // claims, though, so a session that looked valid there but has no user
  // here (deleted account, revoked session) still needs somewhere to go.
  if (!user) {
    redirect("/sign-in");
  }

  // create_household's own migration notes multi-household membership is
  // intentionally unrestricted (composite PK, not unique on user_id) — a
  // caller could belong to more than one. Without an explicit order, which
  // one comes back first is undefined and can vary between requests; this
  // orders by joined_at so the choice is at least deterministic (oldest
  // membership first) rather than arbitrary. Not a full multi-household
  // answer (there's no UI anywhere for a member to choose or switch
  // households), same known limitation as ensureHousehold's identical
  // unordered read in src/server/services/household.ts.
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
  // The household bootstrap at sign-up/sign-in failed (its notice
  // auto-continues here). Offer to finish the setup rather than throwing
  // into error.tsx, whose Retry would only repeat this same read.
  if (!membership) {
    return (
      <>
        <RegisterStuffView total={0} mode="setup" />
        <HouseholdSetupRetry />
      </>
    );
  }

  const [{ entries, locations }, householdResult] = await Promise.all([
    loadStuffEntries(supabase, membership.household_id),
    // Whether Guided onboarding has already run its course for this
    // household — see guided-onboarding.tsx's own doc comment for why
    // "zero items" alone can't answer that on its own.
    supabase.from("households").select("onboarding_completed_at").eq("id", membership.household_id).single(),
  ]);

  if (householdResult.error) {
    throw new Error(householdResult.error.message);
  }

  // Guided onboarding replaces the plain empty state, not the whole page,
  // and only for a household that's both actually empty AND hasn't already
  // run the sequence to completion (see households.onboarding_completed_at
  // and guided-onboarding.tsx's own doc comment on why both checks matter).
  // In onboarding mode the shared header asks its own question and drops
  // search, Stash and the chips: Stash is a second, unguided way into the
  // same flow, and a tap on it silently abandons the sequence.
  const showOnboarding = entries.length === 0 && householdResult.data.onboarding_completed_at === null;

  return (
    <>
      <RegisterStuffView total={entries.length} mode={showOnboarding ? "onboarding" : "list"} />
      {showOnboarding ? (
        <GuidedOnboarding householdId={membership.household_id} locations={locations} />
      ) : (
        /*
          StuffSearchResults ranks `entries` against the header's query,
          client-side: substring matches while the embedding model loads (or
          if it never does), a by-meaning ranking once it is ready
          (src/lib/search/). Entries themselves are resolved server-side
          here. emptyStateAction only ever shows for the true "this
          household has zero items" case (StuffList's own empty state) — a
          "no search matches" query shows a different empty state.
        */
        <StuffSearchResults
          entries={entries}
          emptyStateAction={
            <Link href="/items/new" className={buttonClassName("primary")}>
              Stash your first item
            </Link>
          }
        />
      )}
    </>
  );
}
