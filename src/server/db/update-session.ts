import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { JwtPayload } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie on every request. Without this,
 * server-rendered pages can see a stale/expired session even though the
 * browser client is still fine. Called from src/proxy.ts.
 *
 * Returns the verified JWT claims alongside the response so the proxy can
 * decide whether to gate the route without a second Supabase round-trip
 * (this runs on every request, including prefetches — see
 * docs/adr/0005-route-protection.md). `claims` is null for a signed-out
 * visitor, and also for a cookie whose signature or `exp` doesn't check
 * out, which is the behaviour we want: unverifiable means signed out.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  claims: JwtPayload | null;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Do not add logic between createServerClient and getClaims() — both are
  // required together to keep the session cookie fresh on every request.
  const { data } = await supabase.auth.getClaims();

  return { response, claims: data?.claims ?? null };
}
