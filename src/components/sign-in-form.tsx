"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
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
 */
export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setIsSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    router.push("/");
    router.refresh();
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
      {submitError ? (
        <p role="alert" className="text-[11.5px] text-mid">
          {submitError}
        </p>
      ) : null}
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
