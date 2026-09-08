"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { validateEmail, validateSignUpPassword } from "@/lib/auth-validation";
import { createClient } from "@/server/db/client";

interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * Standalone sign-up form — calls the browser Supabase client directly
 * (src/server/db/client.ts), not a route handler; there's no server-side
 * invariant here for a route handler to own (see CLAUDE.md's "Writes that
 * carry invariants go through route handlers" — creating an auth.users row
 * isn't one of those).
 *
 * Branches on the actual `data.session` in signUp's response rather than
 * assuming: locally, supabase/config.toml has `enable_confirmations =
 * false`, so signUp returns an active session immediately and this redirects
 * straight to "/". If confirmations were required, session would come back
 * null and this shows a real "check your email" state instead of silently
 * doing nothing.
 */
export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {
      email: validateEmail(email),
      password: validateSignUpPassword(password),
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setIsSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    if (data.session) {
      router.push("/");
      router.refresh();
      return;
    }

    // signUp succeeded but returned no session — email confirmation is
    // required for this project. Not the local default, but handled for
    // real rather than assumed away.
    setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-[9px] border-[1.5px] border-line p-4">
        <p className="text-[13px] font-semibold text-ink">Check your email to confirm your account</p>
        <p className="text-[12px] text-mid">
          We sent a confirmation link to {email}. Follow it to finish setting up your account, then{" "}
          <Link href="/sign-in" className="font-semibold text-ink underline underline-offset-2">
            sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <FormField
        id="sign-up-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email}
        disabled={isSubmitting}
      />
      <FormField
        id="sign-up-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
        error={fieldErrors.password}
        disabled={isSubmitting}
      />
      {submitError ? (
        <p role="alert" className="text-[11.5px] text-mid">
          {submitError}
        </p>
      ) : null}
      <Button type="submit" variant="primary" isLoading={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
      <p className="text-center text-[11.5px] text-mid">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-semibold text-ink underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </form>
  );
}
