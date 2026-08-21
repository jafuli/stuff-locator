import type { NextRequest } from "next/server";
import { updateSession } from "@/server/db/update-session";

// Next.js 16 renamed middleware.ts -> proxy.ts (and moved it to the Node.js
// runtime). This is that file, not a typo.
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|apple-icon.png|icons/|serwist/|manifest.webmanifest|~offline).*)",
  ],
};
