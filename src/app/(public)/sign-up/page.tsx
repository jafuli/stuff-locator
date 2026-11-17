import { SignUpForm } from "@/components/sign-up-form";
import { safeRedirectPath } from "@/lib/safe-redirect-path";
import { SiteHeader } from "@/components/site-header";

// Standalone auth page, and one of the four paths src/lib/route-access.ts
// keeps reachable without a session (the app is otherwise deny-by-default
// — see docs/adr/0006-route-protection.md). A successful sign-up
// bootstraps a household via /api/household/bootstrap before navigating
// on. Lives in the (public) route group, so it gets the standalone column
// and no floating nav: the Stuff/Activity tabs belong to the signed-in app
// (ADR 0013).
//
// Takes the same validated ?next= return-to as /sign-in — a visitor
// bounced off a protected route who follows the "create an account" link
// keeps their destination instead of silently landing on "/". See
// src/app/(public)/sign-in/page.tsx for why this is read server-side.
export default async function SignUpPage(props: PageProps<"/sign-up">) {
  const { next } = await props.searchParams;

  return (
    <>
      <SiteHeader homeLink />
      <main className="flex flex-col gap-4">
        <h1 className="text-display text-ink">Create your account</h1>
        <SignUpForm next={safeRedirectPath(typeof next === "string" ? next : undefined)} />
      </main>
    </>
  );
}
