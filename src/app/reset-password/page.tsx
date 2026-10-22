import { ResetPasswordForm } from "@/components/reset-password-form";

// Standalone auth page — same "no loading.tsx/error.tsx" reasoning as
// forgot-password/page.tsx.
export default function ResetPasswordPage() {
  return (
    <main className="flex flex-col gap-4 px-gutter pt-6">
      <h1 className="text-display text-ink">Choose a new password</h1>
      <ResetPasswordForm />
    </main>
  );
}
