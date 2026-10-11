import { redirect } from "next/navigation";
import { ActivityFeed } from "@/components/activity-feed";
import { createClient } from "@/server/db/server";
import { fetchActivityEntries } from "@/server/services/activity";

// Catch up, core flow #4: a newest-first "who changed what" feed for the
// household, derived from items' own add/move provenance (see
// fetchActivityEntries). Real data — this was the last fixture-backed route.
export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const entries = await fetchActivityEntries(supabase, user.id);

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Activity</h1>
      <ActivityFeed entries={entries} />
    </main>
  );
}
