import { SignUpForm } from "@/components/sign-up-form";
import { safeRedirectPath } from "@/lib/safe-redirect-path";

// Standalone auth page, and one of the four paths src/lib/route-access.ts
// keeps reachable without a session (the app is otherwise deny-by-default
// — see docs/adr/0005-route-protection.md). A successful sign-up
// bootstraps a household via /api/household/bootstrap before navigating
// on. Renders inside the app's one shared shell
// (src/app/layout.tsx), but without the bottom nav — SiteNav hides itself
// entirely on this route (see site-nav.tsx's ROUTES_WITHOUT_NAV), since the
// Stuff/Activity tabs point at fixture-backed app content that has nothing
// to do with signing up.
//
// Takes the same validated ?next= return-to as /sign-in — a visitor
// bounced off a protected route who follows the "create an account" link
// keeps their destination instead of silently landing on "/". See
// src/app/sign-in/page.tsx for why this is read server-side.
export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { next } = await props.searchParams;

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Create your account</h1>
      <SignUpForm next={safeRedirectPath(typeof next === "string" ? next : undefined)} />
    </main>
  );
}
