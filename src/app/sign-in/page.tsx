import { SignInForm } from "@/components/sign-in-form";
import { safeRedirectPath } from "@/lib/safe-redirect-path";

// Standalone auth page — see src/app/sign-up/page.tsx's comment; the same
// scope notes apply here.
//
// This is also where the proxy's return-to lands: a signed-out visitor who
// asked for /items/abc gets bounced here as /sign-in?next=/items/abc, and
// SignInForm sends them on after a successful sign-in. The param is
// attacker-controllable, so it's validated here at the trust boundary
// (safeRedirectPath) rather than inside the form — read via searchParams
// on the server instead of useSearchParams() in the client component,
// which would need its own Suspense boundary for no gain.
export default async function SignInPage(props: PageProps<"/sign-in">) {
  const { next } = await props.searchParams;

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Sign in</h1>
      <SignInForm next={safeRedirectPath(typeof next === "string" ? next : undefined)} />
    </main>
  );
}
