import { redirect } from "next/navigation";
import { AddPlaceHere } from "@/components/add-place-here";
import { BrowseContent } from "@/components/browse-content";
import { LocationList } from "@/components/location-list";
import { CountLine } from "@/components/count-line";
import { RegisterStuffView } from "@/components/stuff-views-shell";
import { EmptyState } from "@/components/ui/empty-state";
import { PLACE_LIMIT, PLACES } from "@/lib/limits";
import { addPlaceLimit } from "@/lib/location-path-picker";
import { createClient } from "@/server/db/server";
import { loadStuffEntries } from "@/server/services/stuff-entries";

// Browse, core flow #3: the room-level entry point. Top-level places only —
// drilling into a place's own contents happens on /browse/[id]. The header
// above (heading, search, Stash, chips) is the layout both views share
// (StuffViewsShell), so switching from All doesn't redraw it.
//
// Typing in that search field searches right here: BrowseContent swaps the
// places for the same results list the Stuff screen shows. So this page loads
// the household's items too, not only its places (20–50 items; one read).
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

  const { entries, locations } = await loadStuffEntries(supabase, membership.household_id);
  const roots = locations.filter((location) => location.parentId === null);

  return (
    <>
      <RegisterStuffView mode="list" />
      <CountLine count={locations.length} max={PLACE_LIMIT} noun={PLACES} />
      <BrowseContent
        entries={entries}
        places={
          <>
            {roots.length === 0 ? (
              <EmptyState title="No places yet" description="Add a place here, or create one when you stash an item." />
            ) : (
              <LocationList locations={roots} />
            )}
            <AddPlaceHere parentId={null} blocked={addPlaceLimit(locations.length, 0)} />
          </>
        }
      />
    </>
  );
}
