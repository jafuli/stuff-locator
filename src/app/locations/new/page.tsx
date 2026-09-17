import { redirect } from "next/navigation";
import { AddLocationForm } from "@/components/add-location-form";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";
import { createClient } from "@/server/db/server";

// Add-location — closes the gap the Stash flow's own AC explicitly left
// open: /items/new only lets you pick an EXISTING location, with no way to
// create a brand-new one inline. Real Supabase write now (see
// add-location-form.tsx): the household and its locations are resolved
// here, server-side, via the same direct-PostgREST read pattern
// items/new/page.tsx already established. This location still won't appear
// on other screens' fixture data until their own wiring tasks land (Browse,
// Home) — see the PR description.
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
    throw new Error("locations/new: signed-in user has no household");
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
      <h1 className="text-[16px] font-semibold text-ink">Add a location</h1>
      <AddLocationForm
        locationOptions={locationOptions}
        locations={locations}
        householdId={membership.household_id}
      />
    </main>
  );
}
