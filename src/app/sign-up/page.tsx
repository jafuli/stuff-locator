import { SignUpForm } from "@/components/sign-up-form";

// Standalone auth page — deliberately not wired into the rest of the app
// (no household bootstrap, no route protection anywhere else). See the PR
// description for what that means today: a freshly signed-up user has zero
// households after this, and every other route keeps rendering fixtures
// completely unchanged. Renders inside the app's one shared shell
// (src/app/layout.tsx), so the bottom nav shows here too — the sign-out
// control doesn't, since SignOutButton only renders with an active session
// (see its own comment), and there isn't one yet on this page.
export default function SignUpPage() {
  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Create your account</h1>
      <SignUpForm />
    </main>
  );
}
