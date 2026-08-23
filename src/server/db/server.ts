import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "@/lib/database.types";

/**
 * Server-side Supabase client for Server Components and Route Handlers.
 * Constructed from the caller's session cookies, so it forwards the
 * caller's JWT and RLS applies exactly as it does client-side — this is
 * deliberately never a service-role client. The one place this app needs
 * to bypass RLS (redeem_invite, where the caller isn't a member yet) gets
 * its own narrowly-scoped client in the Pair session, not this one.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, where cookies can't be
          // written. Harmless as long as src/proxy.ts is refreshing
          // sessions on every request (it is).
        }
      },
    },
  });
}
