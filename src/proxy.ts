import { NextResponse, type NextRequest } from "next/server";
import { requiresAuth } from "@/lib/route-access";
import { updateSession } from "@/server/db/update-session";

// Next.js 16 renamed middleware.ts -> proxy.ts (and moved it to the Node.js
// runtime). This is that file, not a typo.
//
// Two jobs, in order: keep the Supabase session cookie fresh (what this
// file always did), then gate the route. The gate is deny-by-default —
// src/lib/route-access.ts names the handful of paths that stay open and
// everything else needs a session. It is deliberately an *optimistic*
// check on the cookie's verified claims, not the app's authorisation
// story: the real-data pages each still call auth.getUser() themselves.
// See docs/adr/0005-route-protection.md for why both exist.
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);

  if (claims || !requiresAuth(request.nextUrl.pathname)) {
    return response;
  }

  const signInUrl = new URL("/sign-in", request.url);
  // Return-to, so a shared link to a specific item survives the detour
  // through sign-in. "/" is the default landing spot anyway, so tacking
  // ?next=/ onto it would just be noise in the URL bar.
  const intended = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  if (intended !== "/") {
    signInUrl.searchParams.set("next", intended);
  }

  const redirect = NextResponse.redirect(signInUrl);
  // Carry over anything updateSession just set. A redirect response is a
  // *different* response object, so without this the refreshed auth
  // cookies are dropped on exactly the requests that get bounced.
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icons/|serwist/|manifest.webmanifest|~offline).*)",
  ],
};
