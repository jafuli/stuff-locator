// Pure client-side validation for the sign-up/sign-in forms — no React, no
// Supabase call. Runs before either form hits the network, so an empty
// field or an obviously malformed email never becomes a round trip.
//
// This is deliberately *not* the source of truth on password strength —
// Supabase Auth still enforces its own `minimum_password_length` server-side
// (see supabase/config.toml) regardless of what runs here. Mirroring that
// number client-side just turns an avoidable network error into an inline
// one; it doesn't replace server-side enforcement.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Matches supabase/config.toml's `[auth] minimum_password_length`. */
export const MIN_PASSWORD_LENGTH = 6;

export function validateEmail(email: string): string | undefined {
  if (email.trim() === "") {
    return "Enter your email address.";
  }
  if (!EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }
  return undefined;
}

/**
 * Sign-up enforces the same minimum length Supabase will anyway, so a short
 * password fails inline instead of after a round trip.
 */
export function validateSignUpPassword(password: string): string | undefined {
  if (password === "") {
    return "Enter a password.";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${String(MIN_PASSWORD_LENGTH)} characters.`;
  }
  return undefined;
}

/**
 * Sign-in only checks for a non-empty password — a real existing account
 * could predate any particular length policy, so enforcing one here could
 * reject a password Supabase would otherwise accept.
 */
export function validateSignInPassword(password: string): string | undefined {
  if (password === "") {
    return "Enter your password.";
  }
  return undefined;
}
