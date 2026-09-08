import { SignUpForm } from "@/components/sign-up-form";

// Standalone auth page — deliberately not wired into the rest of the app
// (no household bootstrap, no route protection anywhere else). See the PR
// description for what that means today: a freshly signed-up user has zero
// households after this, and every other route keeps rendering fixtures
// completely unchanged. Renders inside the app's one shared shell
// (src/app/layout.tsx), so the bottom nav / sign-out strip show here too —
// see site-nav.tsx's comment for why that's accepted rather than fixed here.
export default function SignUpPage() {
  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Create your account</h1>
      <SignUpForm />
    </main>
  );
}
