import { redirect } from "next/navigation";
import { StashForm } from "@/components/stash-form";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";
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

  const { data: locationRows, error: locationsError } = await supabase
    .from("locations")
    .select("id, parent_id, name")
    .eq("household_id", membership.household_id);

  if (locationsError) {
    throw new Error(locationsError.message);
  }

  const locations: Location[] = locationRows.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
  }));
  const locationOptions = getFullLocationPaths(locations);

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Add an item</h1>
      <StashForm
        locationOptions={locationOptions}
        locations={locations}
        householdId={membership.household_id}
        userId={user.id}
      />
    </main>
  );
}
