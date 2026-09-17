import Link from "next/link";
import { redirect } from "next/navigation";
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
// The "+ Add location" control (Add-location flow, /locations/new) links
// out — wiring beyond that link is a separate task's scope (AC #5).
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
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[16px] font-semibold text-ink">Browse</h1>
        <Link
          href="/locations/new"
          className="inline-flex items-center justify-center rounded-[8px] bg-ink px-[10px] py-[7px] text-[12px] font-semibold text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          + Add location
        </Link>
      </div>

      {roots.length === 0 ? (
        <EmptyState title="No rooms yet" description="Add a room to start organizing your stuff." />
      ) : (
        <LocationList locations={roots} />
      )}
    </main>
  );
}
