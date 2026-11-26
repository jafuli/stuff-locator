import Link from "next/link";
import { redirect } from "next/navigation";
import { StashForm } from "@/components/stash-form";
import { buttonClassName } from "@/components/ui/button";
import { ITEM_LIMIT_MESSAGE } from "@/lib/limit-errors";
import { ITEM_LIMIT } from "@/lib/limits";
import { STUFF_PATH } from "@/lib/routes";
import type { Location } from "@/lib/fixtures/types";
import { createClient } from "@/server/db/server";

// Stash — record an item, its room/container, and a free-text "where
// exactly". Real Supabase writes now (see stash-form.tsx): the household
// and its locations are resolved here, server-side, via the same direct-
// PostgREST read pattern src/server/services/household.ts's ensureHousehold
// already established, then handed down as props. An unauthenticated
// visitor is redirected to sign in rather than rendering a form that could
// never resolve a household. A signed-in user with no household at all
// shouldn't happen — household bootstrap runs on every sign-up/sign-in —
// so that case is left to throw into this segment's error.tsx rather than
// guessed at with silent fallback data.
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
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    throw new Error(membershipError.message);
  }
  if (!membership) {
    throw new Error("items/new: signed-in user has no household");
  }

  const [locationsResult, itemsResult] = await Promise.all([
    supabase.from("locations").select("id, parent_id, name").eq("household_id", membership.household_id),
    // Only the count: at the item cap the form is replaced by an explanation.
    supabase.from("items").select("id", { count: "exact", head: true }).eq("household_id", membership.household_id),
  ]);

  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }
  if (itemsResult.error) {
    throw new Error(itemsResult.error.message);
  }
  const locationRows = locationsResult.data;
  const atItemLimit = (itemsResult.count ?? 0) >= ITEM_LIMIT;

  const locations: Location[] = locationRows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
  }));

  return (
    <main className="flex flex-col gap-4 px-gutter pt-6">
      <h1 className="text-display text-ink">Add an item</h1>
      {atItemLimit ? (
        // Stash stays reachable at the cap (ADR 0015) and says why there's no
        // form, with the way to make room. If the cap is hit while the form
        // is open (a partner took the last slot), saving shows the same copy.
        <div className="flex flex-col gap-3 rounded-panel border border-hairline bg-surface p-4">
          <p className="text-body text-ink">{ITEM_LIMIT_MESSAGE}</p>
          <Link href={STUFF_PATH} className={buttonClassName("secondary", "w-full sm:w-fit")}>
            Go to my stuff
          </Link>
        </div>
      ) : (
        <StashForm locations={locations} />
      )}
    </main>
  );
}
