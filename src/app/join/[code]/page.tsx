import { JoinInviteFlow } from "@/components/join-invite-flow";
import { createClient } from "@/server/db/server";

// Redeem-invite landing — the other half of Invite-partner UI's
// `${origin}/join/${code}` link (invite-panel.tsx). Whether the visitor is
// signed in is resolved here, server-side, from the session cookie, and
// handed down as a prop — everything else (redemption itself, the
// sign-up/sign-in toggle, success/error display) is JoinInviteFlow's own
// client-side state machine, since redemption needs the browser Supabase
// client's session either way.
export default async function Page(props: PageProps<"/join/[code]">) {
  const { code } = await props.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Join a household</h1>
      <JoinInviteFlow code={code} initiallySignedIn={Boolean(user)} />
    </main>
  );
}
