import Link from "next/link";
import { redirect } from "next/navigation";
import { AddPlaceHere } from "@/components/add-place-here";
import { LocationList } from "@/components/location-list";
import { EmptyState } from "@/components/ui/empty-state";
import type { Location } from "@/lib/fixtures/types";
import { createClient } from "@/server/db/server";

// Browse, core flow #3: the room-level entry point. Top-level locations
// (parent_id is null) only — drilling into a room's own contents happens on
// /browse/[id]. Real Supabase read now (see the PR description): a direct,
// targeted PostgREST read, not a full household location list, mirroring
// items/new/page.tsx's household-resolution pattern.
//
// "+ Add a place here" is the name-only shortcut for an empty place (ADR
// 0010); places made while stashing an item are created in the item picker.
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
    throw new Error("browse: signed-in user has no household");
  }

  const { data: rootRows, error: rootError } = await supabase
    .from("locations")
    .select("id, parent_id, name")
    .eq("household_id", membership.household_id)
    .is("parent_id", null);

  if (rootError) {
    throw new Error(rootError.message);
  }

  const roots: Location[] = rootRows.map((row) => ({ id: row.id, parentId: row.parent_id, name: row.name }));

  return (
    <main className="flex flex-col gap-3 p-4">
      <Link
        href="/"
        className="w-fit text-[11.5px] text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ‹ Back to Stuff
      </Link>
      <h1 className="text-[16px] font-semibold text-ink">Browse</h1>

      {roots.length === 0 ? (
        <EmptyState title="No places yet" description="Add a place here, or create one when you stash an item." />
      ) : (
        <LocationList locations={roots} />
      )}

      <AddPlaceHere parentId={null} />
    </main>
  );
}
