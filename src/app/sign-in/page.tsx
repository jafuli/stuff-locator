import { SignInForm } from "@/components/sign-in-form";

// Standalone auth page — see src/app/sign-up/page.tsx's comment; the same
// scope notes apply here.
export default function SignInPage() {
  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Sign in</h1>
      <SignInForm />
    </main>
  );
}
