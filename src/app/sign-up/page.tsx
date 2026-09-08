import { SignUpForm } from "@/components/sign-up-form";

// Standalone auth page — deliberately not wired into the rest of the app
// (no household bootstrap, no route protection anywhere else). See the PR
// description for what that means today: a freshly signed-up user has zero
// households after this, and every other route keeps rendering fixtures
// completely unchanged. Renders inside the app's one shared shell
// (src/app/layout.tsx), but without the bottom nav — SiteNav hides itself
// entirely on this route (see site-nav.tsx's ROUTES_WITHOUT_NAV), since the
// Stuff/Activity tabs point at fixture-backed app content that has nothing
// to do with signing up.
export default function SignUpPage() {
  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Create your account</h1>
      <SignUpForm />
    </main>
  );
}
