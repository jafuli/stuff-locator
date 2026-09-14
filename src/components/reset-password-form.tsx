"use client";

import Link from "next/link";
import { useEffect, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { validatePasswordConfirmation, validateSignUpPassword } from "@/lib/auth-validation";
import { createClient } from "@/server/db/client";

interface FieldErrors {
  password?: string;
  confirmation?: string;
}

type Status = "checking" | "invalid" | "ready" | "updated";

// How long to wait for a PASSWORD_RECOVERY event before concluding there
// never was a valid recovery link to process. Purely a local heuristic —
// Supabase doesn't emit an explicit "no recovery session" event — but
// generous enough for the client's own (local, hash-only, no network
// round trip) URL processing to have long since finished by then.
const RECOVERY_CHECK_TIMEOUT_MS = 3000;

/**
 * Standalone reset-password form — the landing page for the emailed
 * recovery link. Calls the browser Supabase client directly, same shape as
 * SignInForm/SignUpForm.
 *
 * Verified against the actual pinned @supabase/auth-js version (2.112.3):
 * it emits a PASSWORD_RECOVERY event via onAuthStateChange the moment it
 * finishes processing a recovery link's URL fragment — that's the
 * mechanism used here, not reading the session directly. Direct
 * navigation to this route, or an expired/already-used link, never fires
 * that event, so this never falls through to rendering the password form
 * for those cases — only the "invalid or expired" state does.
 */
export function ResetPasswordForm() {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setStatus("ready");
      }
    });

    const timeout = setTimeout(() => {
      setStatus((current) => (current === "checking" ? "invalid" : current));
    }, RECOVERY_CHECK_TIMEOUT_MS);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {
      password: validateSignUpPassword(password),
      confirmation: validatePasswordConfirmation(password, confirmation),
    };
    setFieldErrors(errors);
    if (errors.password || errors.confirmation) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }
    setStatus("updated");
  }

  if (status === "checking") {
    return (
      <p aria-live="polite" className="text-[11.5px] text-mid">
        Checking your reset link…
      </p>
    );
  }

  if (status === "invalid") {
    return (
      <EmptyState
        title="This reset link is invalid or has expired"
        description="Request a new one to keep going."
        action={
          <Link
            href="/forgot-password"
            className="inline-flex items-center justify-center rounded-[8px] border-[1.5px] border-line bg-transparent px-[10px] py-[10px] text-[13px] [font-weight:640] text-mid outline-none transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Request a new link
          </Link>
        }
      />
    );
  }

  if (status === "updated") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink">Your password has been changed.</p>
        <Link
          href="/sign-in"
          className="w-fit text-[11.5px] font-semibold text-ink underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <FormField
        id="reset-password-password"
        label="New password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        error={fieldErrors.password}
        disabled={isSubmitting}
      />
      <FormField
        id="reset-password-confirmation"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirmation}
        onChange={setConfirmation}
        error={fieldErrors.confirmation}
        disabled={isSubmitting}
      />
      {submitError ? (
        <p role="alert" className="text-[11.5px] text-mid">
          {submitError}
        </p>
      ) : null}
      <Button type="submit" variant="primary" isLoading={isSubmitting}>
        {isSubmitting ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
