"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { validateEmail } from "@/lib/auth-validation";
import { createClient } from "@/server/db/client";

interface FieldErrors {
  email?: string;
}

/**
 * Standalone forgot-password form — calls the browser Supabase client
 * directly (src/server/db/client.ts), same shape as SignInForm/SignUpForm.
 *
 * Always shows the same generic confirmation once a submit attempt
 * completes, regardless of the outcome: Supabase's resetPasswordForEmail
 * never reveals whether an account exists for the given email (returns no
 * error either way, by design, to prevent account enumeration), and a
 * genuine failure (network, rate limit) would look identical from the
 * outside if it were surfaced differently — doing so would just reopen the
 * same enumeration risk in a different shape. Any real error is still
 * logged for debugging, never shown in the UI.
 */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = { email: validateEmail(email) };
    setFieldErrors(errors);
    if (errors.email) {
      return;
    }

    setIsSubmitting(true);
    // A try/catch here, not just checking the returned `error`: Supabase's
    // own client re-throws (rather than resolving to `{ error }`) for
    // anything it doesn't recognize as a structured AuthError — a raw
    // network failure, for instance. Without this, that case would leave
    // the button stuck on "Sending…" forever instead of reaching the same
    // determinate confirmation state every other outcome already does.
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        console.error("[forgot-password]", error.message);
      }
    } catch (error) {
      console.error("[forgot-password]", error);
    }
    setIsSubmitting(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="text-[12.5px] text-ink">
          If an account exists for that email, we&apos;ve sent a link to reset the password.
        </p>
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
        id="forgot-password-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email}
        disabled={isSubmitting}
      />
      <Button type="submit" variant="primary" isLoading={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-center text-[11.5px] text-mid">
        <Link href="/sign-in" className="font-semibold text-ink underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
