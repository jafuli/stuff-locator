import { redirect } from "next/navigation";
import { ActivityHistory } from "@/components/activity-history";
import { ACTIVITY_HEADING } from "@/lib/activity-heading";
import { createClient } from "@/server/db/server";
import { fetchActivityEntries } from "@/server/services/activity";

// Catch up, core flow #4: a newest-first "who changed what" feed for the
// household, read from the activity_events log (ADR 0011; see
// fetchActivityEntries). The first page renders here; "Show earlier
// activity" pages back through everything the household keeps.
export default async function ActivityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  const { householdId, entries, next } = await fetchActivityEntries(supabase, user.id);

  return (
    <main className="flex flex-col gap-4 px-gutter pt-6">
      <h1 className="text-display text-ink">{ACTIVITY_HEADING}</h1>
      <ActivityHistory householdId={householdId} initial={{ entries, next }} now={new Date().toISOString()} />
    </main>
  );
}
