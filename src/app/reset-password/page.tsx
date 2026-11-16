import { ResetPasswordForm } from "@/components/reset-password-form";
import { SiteHeader, STANDALONE_PAGE_CLASSES } from "@/components/site-header";

// Standalone auth page — same "no loading.tsx/error.tsx" reasoning as
// forgot-password/page.tsx.
export default function ResetPasswordPage() {
  return (
    <div className={STANDALONE_PAGE_CLASSES}>
      <SiteHeader homeLink />
      <main className="flex flex-col gap-4">
        <h1 className="text-display text-ink">Choose a new password</h1>
        <ResetPasswordForm />
      </main>
    </div>
  );
}
