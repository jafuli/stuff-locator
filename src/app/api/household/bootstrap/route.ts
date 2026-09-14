import { createClient } from "@/server/db/server";
import { ensureHousehold } from "@/server/services/household";

/**
 * Makes sure the calling user belongs to a household, creating one via
 * create_household if they don't already. Called from the sign-up and
 * sign-in forms right before they redirect to "/" — see those components
 * for the client side of this.
 *
 * No request body: identity is resolved server-side from the session
 * cookie via auth.getUser(), not trusted from the client. Uses the
 * cookie-bound server client (src/server/db/server.ts) — never
 * service-role — so RLS still gates the membership read exactly as it
 * would client-side; the RPC itself is what's privileged, not this
 * handler.
 *
 * Per src/app/api/README.md's contract, this does no business logic of its
 * own — authorise, delegate to src/server/services, map the result to a
 * response. The raw Postgres/RPC error is logged here and never returned
 * to the client: unlike a wrong-password message, it isn't something the
 * user can act on.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return Response.json({ ok: false }, { status: 401 });
  }

  const result = await ensureHousehold(supabase, user.id, user.email);
  if (!result.ok) {
    console.error("[household-bootstrap]", result.error);
    return Response.json({ ok: false }, { status: 500 });
  }

  return Response.json({ ok: true, created: result.created });
}
