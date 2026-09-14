import { ForgotPasswordForm } from "@/components/forgot-password-form";

// Standalone auth page — mirrors sign-in/sign-up's shape (no loading.tsx/
// error.tsx: this is a pure client form with no async Server Component
// data dependency to suspend or fail on, unlike the fixture-reading routes
// such as Stash or item-detail).
export default function ForgotPasswordPage() {
  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Reset your password</h1>
      <ForgotPasswordForm />
    </main>
  );
}
