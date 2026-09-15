"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { HouseholdBootstrapNotice } from "@/components/household-bootstrap-notice";
import { BOOTSTRAP_NOTICE_AUTO_CONTINUE_MS, triggerHouseholdBootstrap } from "@/lib/household-bootstrap-client";
import { validateEmail, validateSignInPassword } from "@/lib/auth-validation";
import { createClient } from "@/server/db/client";

interface FieldErrors {
  email?: string;
  password?: string;
}

/**
 * Standalone sign-in form — calls the browser Supabase client directly
 * (src/server/db/client.ts). Always redirects to "/" on success; there's no
 * confirmation branch here the way there is for sign-up.
 *
 * The rejected-credentials error surfaces Supabase's own message verbatim
 * (e.g. "Invalid login credentials") rather than a generic "wrong email or
 * password" — deliberate per this task's Acceptance Criteria, discussed in
 * the PR description's "Worth a closer look".
 *
 * Every successful sign-in also makes sure the user belongs to a household
 * (POST /api/household/bootstrap) before redirecting. Unlike SignUpForm,
 * there's no branch to skip here — signInWithPassword only succeeds with a
 * session — so this is also where a user who signed up under
 * enable_confirmations=true gets bootstrapped for the first time.
 */
export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
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
      password: validateSignInPassword(password),
    };
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setIsSubmitting(false);
      setSubmitError(error.message);
      return;
    }

    // Deliberately still isSubmitting through this await, not just the
    // signInWithPassword call above: re-enabling the button here would let
    // an impatient double-click start a second sign-in/bootstrap cycle for
    // the same user before this one's household check has even run —
    // exactly the "two concurrent bootstrap calls" race
    // src/server/services/household.ts's own doc comment names as a rare
    // edge case, made trivially reachable from one tab otherwise.
    const bootstrapped = await triggerHouseholdBootstrap();
    setIsSubmitting(false);
    if (!bootstrapped) {
      console.error("[household-bootstrap] failed to ensure a household after sign-in");
      setShowBootstrapNotice(true);
      autoContinueTimeout.current = setTimeout(navigateHome, BOOTSTRAP_NOTICE_AUTO_CONTINUE_MS);
      return;
    }
    navigateHome();
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <FormField
        id="sign-in-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={setEmail}
        error={fieldErrors.email}
        disabled={isSubmitting}
      />
      <FormField
        id="sign-in-password"
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        error={fieldErrors.password}
        disabled={isSubmitting}
      />
      <Link
        href="/forgot-password"
        className="w-fit text-[11.5px] text-mid underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        Forgot your password?
      </Link>
      {submitError ? (
        <p role="alert" className="text-[11.5px] text-mid">
          {submitError}
        </p>
      ) : null}
      {showBootstrapNotice ? <HouseholdBootstrapNotice onContinue={navigateHome} /> : null}
      <Button type="submit" variant="primary" isLoading={isSubmitting}>
        {isSubmitting ? "Signing in…" : "Sign in"}
      </Button>
      <p className="text-center text-[11.5px] text-mid">
        Don&apos;t have an account?{" "}
        <Link href="/sign-up" className="font-semibold text-ink underline underline-offset-2">
          Sign up
        </Link>
      </p>
    </form>
  );
}
