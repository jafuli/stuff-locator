import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing ${name} — this spec's household-count assertions need a real local ` +
        "Supabase stack. Run `npm run supabase:start`, then either export " +
        "SUPABASE_URL/SUPABASE_ANON_KEY yourself or write them to a gitignored " +
        ".env.rls.local (from `npx supabase status -o env`) — `npm run test:e2e` " +
        "auto-loads that file the same way `npm run test:rls` does.",
    );
  }
  return value;
}

/**
 * Signs in as the given user from Node (not the browser under test) and
 * counts their household_members rows — used to prove household-bootstrap
 * doesn't create duplicate households, without depending on any UI
 * surfacing that count (the app's real pages are still fixture-backed).
 * Mirrors the signInAs pattern already established in supabase/tests/.
 */
export async function countHouseholdsForUser(email: string, password: string): Promise<number> {
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const anonKey = requireEnv("SUPABASE_ANON_KEY");

  const anonClient = createClient<Database>(supabaseUrl, anonKey);
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error) {
    throw new Error(`failed to sign in as ${email} for a household-count check: ${error.message}`);
  }

  const userClient = createClient<Database>(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
  });
  const { data: memberships, error: membershipError } = await userClient
    .from("household_members")
    .select("household_id")
    .eq("user_id", data.user.id);
  if (membershipError) {
    throw new Error(`failed to read household_members for ${email}: ${membershipError.message}`);
  }
  return memberships.length;
}
