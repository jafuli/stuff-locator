import { NextResponse, type NextRequest } from "next/server";
import { resolveRoute } from "@/lib/route-access";
import { updateSession } from "@/server/db/update-session";

// Next.js 16 renamed middleware.ts -> proxy.ts (and moved it to the Node.js
// runtime). This is that file, not a typo.
//
// Two jobs, in order: keep the Supabase session cookie fresh (what this
// file always did), then route the request: send a signed-in "/" on to the
// Stuff screen (ADR 0013, amended 2026-11-17), and gate everything else. The gate is deny-by-default —
// src/lib/route-access.ts names the handful of paths that stay open and
// everything else needs a session. It is deliberately an *optimistic*
// check on the cookie's verified claims, not the app's authorisation
// story: the real-data pages each still call auth.getUser() themselves.
// See docs/adr/0006-route-protection.md for why both exist.
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const decision = resolveRoute(request.nextUrl.pathname, request.nextUrl.search, claims !== null);

  if (decision.kind === "next") {
    return response;
  }

  const target = new URL(decision.pathname, request.url);
  // Signed-in "/" → the Stuff screen: keep the query, so "/?q=keys" still searches.
  if (decision.search !== undefined) {
    target.search = decision.search;
  }
  // Return-to, so a shared link to a specific item survives the detour
  // through sign-in.
  if (decision.next !== undefined) {
    target.searchParams.set("next", decision.next);
  }
  const routed = NextResponse.redirect(target);

  // Carry over anything updateSession just set. A redirect is a
  // *different* response object, so without this the refreshed auth
  // cookies are dropped on exactly the requests that get routed.
  for (const cookie of response.cookies.getAll()) {
    routed.cookies.set(cookie);
  }
  return routed;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icons/|serwist/|manifest.webmanifest|~offline).*)",
  ],
};
