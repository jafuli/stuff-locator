import Link from "next/link";
import { redirect } from "next/navigation";
import { InvitePanel } from "@/components/invite-panel";
import { LIMIT_ERROR_CODES } from "@/lib/limits";
import { createClient } from "@/server/db/server";
import { buttonClassName } from "@/components/ui/button";
import { FROM_ONBOARDING, STUFF_PATH } from "@/lib/routes";

// Invite-partner UI: get the household's live invite code (create_invite
// reuses one or makes one, atomically) and display a shareable
// /join/[code] link — or, once both partners are in, say so instead.
//
// Route choice: /settings/invite (documented per this task's AC — no
// existing settings surface, "/household/invite" was the other named
// option; picked /settings since a settings *section* is the more
// natural future home for account/household-level actions beyond just
// invites, whereas /household/invite reads as if it could only ever be
// this one thing).
export default async function Page(props: PageProps<"/settings/invite">) {
  // Arriving from the end of guided onboarding: the flow ends here, and
  // onboarding is already marked complete, so offer the way on to Stuff.
  const { from } = await props.searchParams;
  const fromOnboarding = from === FROM_ONBOARDING;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  // create_invite returns the household's live invite or makes one, under
  // a lock on the household row, so two loads at once get the same code.
  // It refuses (SL005) once the household has its two members, and raises
  // if the caller has no household at all (the error boundary shows that).
  const { data: invite, error: inviteError } = await supabase.rpc("create_invite");
  const householdFull = inviteError?.code === LIMIT_ERROR_CODES.householdFull;

  if (inviteError && !householdFull) {
    throw new Error(inviteError.message);
  }

  return (
    <main className="flex flex-col gap-4 px-gutter pt-6">
      <h1 className="text-display text-ink">Invite your partner</h1>
      {householdFull || !invite ? (
        <p className="text-body text-ink">
          Your household is complete: you and your partner are both in. A household is made for two, so there&apos;s no
          one left to invite.
        </p>
      ) : (
        <>
          <p className="text-meta text-muted">Share this code or link — anyone with it can join your household.</p>
          <InvitePanel code={invite.code} />
        </>
      )}
      {fromOnboarding ? (
        <Link href={STUFF_PATH} className={buttonClassName("secondary", "w-full sm:w-fit")}>
          Go to my stuff
        </Link>
      ) : null}
    </main>
  );
}
