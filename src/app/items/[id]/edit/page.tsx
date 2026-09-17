import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ItemEditForm } from "@/components/item-edit-form";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";
import { createClient } from "@/server/db/server";

const INVALID_UUID_ERROR_CODE = "22P02";

// Edit item — real Supabase reads now (see the PR description): the item
// and the household's full location list (for the autocomplete, same
// shape as items/new/page.tsx's Stash read) are resolved here server-side.
// `notFound()` for a nonexistent or not-visible-under-RLS id renders this
// segment's own not-found.tsx, same as item-detail.
export default async function Page(props: PageProps<"/items/[id]/edit">) {
  const { id } = await props.params;

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
    throw new Error("items/[id]/edit: signed-in user has no household");
  }

  const [itemResult, locationsResult] = await Promise.all([
    supabase.from("items").select("*").eq("household_id", membership.household_id).eq("id", id).maybeSingle(),
    supabase.from("locations").select("id, parent_id, name").eq("household_id", membership.household_id),
  ]);

  if (itemResult.error && itemResult.error.code !== INVALID_UUID_ERROR_CODE) {
    throw new Error(itemResult.error.message);
  }
  if (!itemResult.data) {
    notFound();
  }
  if (locationsResult.error) {
    throw new Error(locationsResult.error.message);
  }

  const locations: Location[] = locationsResult.data.map((row) => ({
    id: row.id,
    parentId: row.parent_id,
    name: row.name,
  }));
  const item: Item = {
    id: itemResult.data.id,
    locationId: itemResult.data.location_id,
    name: itemResult.data.name,
    detail: itemResult.data.detail ?? undefined,
    addedBy: itemResult.data.added_by,
    addedAt: new Date(itemResult.data.added_at),
    lastMovedBy: itemResult.data.last_moved_by ?? undefined,
    lastMovedAt: itemResult.data.last_moved_at ? new Date(itemResult.data.last_moved_at) : undefined,
  };
  const locationOptions = getFullLocationPaths(locations);

  return (
    <main className="flex flex-col gap-3 p-4">
      <Link
        href={`/items/${id}`}
        className="w-fit text-[11.5px] text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ‹ Back to item
      </Link>
      <h1 className="text-[16px] font-semibold text-ink">Edit item</h1>
      <ItemEditForm item={item} locationOptions={locationOptions} locations={locations} />
    </main>
  );
}
