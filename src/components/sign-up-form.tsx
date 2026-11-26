"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useFieldErrors } from "@/components/use-field-errors";
import { HouseholdBootstrapNotice } from "@/components/household-bootstrap-notice";
import { BOOTSTRAP_NOTICE_AUTO_CONTINUE_MS, triggerHouseholdBootstrap } from "@/lib/household-bootstrap-client";
import {
  normalizeDisplayName,
  validateDisplayName,
  validateEmail,
  validateSignUpPassword,
} from "@/lib/auth-validation";
import { TEXT_LIMITS } from "@/lib/limits";
import { redeemInviteAndGetHouseholdName, type RedeemInviteResult } from "@/lib/redeem-invite-client";
import { DEFAULT_REDIRECT_PATH, withNextParam } from "@/lib/safe-redirect-path";
import { createClient } from "@/server/db/client";
import { textLinkClassName } from "@/components/ui/text-link";

/** On-screen order, for where focus goes after a failed submit. */
const FIELDS = ["name", "email", "password"] as const;

export interface SignUpFormProps {
  /**
   * When set, a successful sign-up redeems this invite code BEFORE the
   * usual household-bootstrap check runs, instead of navigating to the Stuff screen —
   * see /join/[code]/page.tsx and JoinInviteFlow. This ordering is the
   * whole point (see redeem-invite-client.ts and that route's own PR
   * description): bootstrap only creates a household if the caller has
   * zero of them, so redeeming first means bootstrap's own check already
   * finds the membership redemption just created and safely no-ops,
   * rather than the visitor ending up in a bootstrap-created household in
   * addition to the one they were invited to.
   */
  invite?: {
    code: string;
    onRedeemed: (result: RedeemInviteResult) => void;
  };
  /**
   * Where to land after a successful sign-up. Carried over from /sign-in
   * via withNextParam, so a visitor bounced off a protected route who
   * then chooses "create an account" still ends up where they meant to
   * go. Already validated by src/app/(public)/sign-up/page.tsx (safeRedirectPath);
   * defaults to the Stuff screen (DEFAULT_REDIRECT_PATH).
   */
  next?: string;
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
 * straight to the Stuff screen (or, with `invite` set, redeems the invite instead — see
 * that prop's own doc comment). If confirmations were required, session
 * would come back null and this shows a real "check your email" state
 * instead of silently doing nothing.
 *
 * When a session comes back, this also makes sure the user belongs to a
 * household (POST /api/household/bootstrap — see that route and
 * src/server/services/household.ts) before redirecting. If confirmation is
 * required instead, there's no session yet to bootstrap with; that user
 * gets bootstrapped the first time they actually sign in post-confirmation
 * (see SignInForm), which calls this unconditionally on every success.
 */
export function SignUpForm({ invite, next = DEFAULT_REDIRECT_PATH }: SignUpFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const {
    fieldErrors,
    report,
    clear,
    inputs: { name: nameInputRef, email: emailInputRef, password: passwordInputRef },
  } = useFieldErrors(FIELDS);
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

  function navigateAfterSignUp() {
    if (autoContinueTimeout.current !== null) {
      clearTimeout(autoContinueTimeout.current);
    }
    router.push(next);
    router.refresh();
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // On a failure, focus moves to the first invalid field.
    const hasErrors = report({
      name: validateDisplayName(name),
      email: validateEmail(email),
      password: validateSignUpPassword(password),
    });
    if (hasErrors) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);
    const supabase = createClient();
    // The name rides along as user metadata; the auth.users trigger
    // (handle_new_user) turns it into the profile's display name, and the
    // household bootstrap names the new household after it.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: normalizeDisplayName(name) } },
    });

    if (error) {
      setIsSubmitting(false);
      setSubmitError(error.message);
      return;
    }

    if (data.session) {
      if (invite) {
        // Redeem BEFORE bootstrap — see SignUpFormProps' own doc comment
        // for why the order matters. Bootstrap still runs afterward
        // regardless of whether redemption succeeded: on success it's a
        // guaranteed no-op (the caller now has ≥1 household already); on
        // failure (an invalid/expired/already-used code) it's the fallback
        // that keeps this brand-new account from being stranded with zero
        // households — redeem_invite's own failure paths never leave a
        // partial household_members row behind (a raised exception rolls
        // back the whole function call), so there's nothing "partial" for
        // bootstrap to collide with here.
        const result = await redeemInviteAndGetHouseholdName(supabase, invite.code);
        await triggerHouseholdBootstrap();
        setIsSubmitting(false);
        invite.onRedeemed(result);
        return;
      }

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
        autoContinueTimeout.current = setTimeout(navigateAfterSignUp, BOOTSTRAP_NOTICE_AUTO_CONTINUE_MS);
        return;
      }
      navigateAfterSignUp();
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
      <div role="status" className="flex flex-col gap-2 rounded-panel border border-hairline bg-surface p-4">
        <p className="text-title text-ink">Check your email to confirm your account</p>
        <p className="text-meta text-muted">
          We sent a confirmation link to {email}. Follow it to finish setting up your account, then{" "}
          <Link href={withNextParam("/sign-in", next)} className={textLinkClassName({ inline: true })}>
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
        id="sign-up-name"
        label="Your name"
        type="text"
        autoComplete="name"
        value={name}
        onChange={(value) => {
          setName(value);
          clear("name");
        }}
        ref={nameInputRef}
        maxLength={TEXT_LIMITS.displayName}
        error={fieldErrors.name}
        disabled={isSubmitting}
      />
      <FormField
        id="sign-up-email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(value) => {
          setEmail(value);
          clear("email");
        }}
        ref={emailInputRef}
        error={fieldErrors.email}
        disabled={isSubmitting}
      />
      <FormField
        id="sign-up-password"
        label="Password"
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(value) => {
          setPassword(value);
          clear("password");
        }}
        ref={passwordInputRef}
        error={fieldErrors.password}
        disabled={isSubmitting}
      />
      {submitError ? (
        <p role="alert" className="text-meta text-signal">
          {submitError}
        </p>
      ) : null}
      {showBootstrapNotice ? <HouseholdBootstrapNotice onContinue={navigateAfterSignUp} /> : null}
      <Button type="submit" variant="primary" isLoading={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>
      {/* This footer link navigates to a standalone /sign-in that knows
          nothing about `invite` — wrong inside the join flow, where
          switching between sign-up/sign-in is JoinInviteFlow's own local
          toggle instead (see that component). */}
      {!invite ? (
        <p className="text-center text-meta text-muted">
          Already have an account?{" "}
          <Link href={withNextParam("/sign-in", next)} className={textLinkClassName({ inline: true })}>
            Sign in
          </Link>
        </p>
      ) : null}
    </form>
  );
}
