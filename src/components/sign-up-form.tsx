"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { HouseholdBootstrapNotice } from "@/components/household-bootstrap-notice";
import { BOOTSTRAP_NOTICE_AUTO_CONTINUE_MS, triggerHouseholdBootstrap } from "@/lib/household-bootstrap-client";
import { validateEmail, validateSignUpPassword } from "@/lib/auth-validation";
import { createClient } from "@/server/db/client";

interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * Standalone sign-up form. The signUp call itself goes straight to the
 * browser Supabase client (src/server/db/client.ts), not a route handler —
 * there's no server-side invariant here for one to own (see CLAUDE.md's
 * "Writes that carry invariants go through route handlers" — creating an
 * auth.users row isn't one of those). Household bootstrap, right below, is
 * different: create_household's invariant is real, so that goes through
 * /api/household/bootstrap instead — see that route's doc comment.
 *
 * Branches on the actual `data.session` in signUp's response rather than
 * assuming: locally, supabase/config.toml has `enable_confirmations =
 * false`, so signUp returns an active session immediately and this redirects
 * straight to "/". If confirmations were required, session would come back
 * null and this shows a real "check your email" state instead of silently
 * doing nothing.
 *
 * When a session comes back, this also makes sure the user belongs to a
 * household (POST /api/household/bootstrap — see that route and
 * src/server/services/household.ts) before redirecting. If confirmation is
 * required instead, there's no session yet to bootstrap with; that user
 * gets bootstrapped the first time they actually sign in post-confirmation
 * (see SignInForm), which calls this unconditionally on every success.
 */
export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [showBootstrapNotice, setShowBootstrapNotice] = useState(false);
  const autoContinueTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (autoContinueTimeout.current !== null) {
        clearTimeout(autoContinueTimeout.current);
      }
    };
  }, []);

  function navigateHome() {
    if (autoContinueTimeout.current !== null) {
      clearTimeout(autoContinueTimeout.current);
    }
    router.push("/");
    router.refresh();
  }

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

    if (error) {
      setIsSubmitting(false);
      setSubmitError(error.message);
      return;
    }

    if (data.session) {
      // Deliberately still isSubmitting through this await, not just the
      // signUp call above: re-enabling the button here would let an
      // impatient double-click start a second signUp/bootstrap cycle for
      // the same brand-new user before this one's household check has
      // even run, which is exactly the "two concurrent bootstrap calls"
      // race ensureHousehold's own doc comment names as a rare edge case —
      // there's no reason to make it trivially reachable from one tab.
      const bootstrapped = await triggerHouseholdBootstrap();
      setIsSubmitting(false);
      if (!bootstrapped) {
        console.error("[household-bootstrap] failed to ensure a household after sign-up");
        setShowBootstrapNotice(true);
        autoContinueTimeout.current = setTimeout(navigateHome, BOOTSTRAP_NOTICE_AUTO_CONTINUE_MS);
        return;
      }
      navigateHome();
      return;
    }

    setIsSubmitting(false);
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
      {showBootstrapNotice ? <HouseholdBootstrapNotice onContinue={navigateHome} /> : null}
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
