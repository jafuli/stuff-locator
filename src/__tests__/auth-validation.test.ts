import { expect, test } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  validateEmail,
  validatePasswordConfirmation,
  validateSignInPassword,
  validateSignUpPassword,
} from "@/lib/auth-validation";

test("validateEmail rejects an empty value", () => {
  expect(validateEmail("")).toBe("Enter your email address.");
  expect(validateEmail("   ")).toBe("Enter your email address.");
});

test("validateEmail rejects a malformed address", () => {
  expect(validateEmail("not-an-email")).toBe("Enter a valid email address.");
  expect(validateEmail("missing-domain@")).toBe("Enter a valid email address.");
  expect(validateEmail("no-at-sign.example.com")).toBe("Enter a valid email address.");
});

test("validateEmail accepts a well-formed address", () => {
  expect(validateEmail("person@example.com")).toBeUndefined();
});

test("validateSignUpPassword rejects an empty value", () => {
  expect(validateSignUpPassword("")).toBe("Enter a password.");
});

test("validateSignUpPassword rejects a password shorter than the minimum", () => {
  const shortPassword = "a".repeat(MIN_PASSWORD_LENGTH - 1);
  expect(validateSignUpPassword(shortPassword)).toBe(`Password must be at least ${String(MIN_PASSWORD_LENGTH)} characters.`);
});

test("validateSignUpPassword accepts a password at exactly the minimum length", () => {
  const minLengthPassword = "a".repeat(MIN_PASSWORD_LENGTH);
  expect(validateSignUpPassword(minLengthPassword)).toBeUndefined();
});

test("validateSignInPassword rejects only an empty value, not a short one", () => {
  expect(validateSignInPassword("")).toBe("Enter your password.");
  expect(validateSignInPassword("a")).toBeUndefined();
});

test("validatePasswordConfirmation rejects an empty confirmation", () => {
  expect(validatePasswordConfirmation("longenough1", "")).toBe("Confirm your new password.");
});

test("validatePasswordConfirmation rejects a mismatched confirmation", () => {
  expect(validatePasswordConfirmation("longenough1", "different1")).toBe("Passwords don't match.");
});

test("validatePasswordConfirmation accepts a matching confirmation", () => {
  expect(validatePasswordConfirmation("longenough1", "longenough1")).toBeUndefined();
});
