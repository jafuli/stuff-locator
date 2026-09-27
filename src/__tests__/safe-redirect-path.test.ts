import { expect, test } from "vitest";
import { DEFAULT_REDIRECT_PATH, safeRedirectPath, withNextParam } from "@/lib/safe-redirect-path";

test("keeps a same-origin absolute path, including its query string", () => {
  expect(safeRedirectPath("/items/abc")).toBe("/items/abc");
  expect(safeRedirectPath("/browse?q=keys")).toBe("/browse?q=keys");
});

test("falls back to / when there's no usable value", () => {
  expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT_PATH);
  expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT_PATH);
  expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT_PATH);
});

// The open-redirect cases. Each of these is a string an attacker can put
// in a link to this app's own sign-in page; without the check, signing in
// navigates the user off-origin.
test("rejects an absolute URL to another origin", () => {
  expect(safeRedirectPath("https://evil.example/phish")).toBe(DEFAULT_REDIRECT_PATH);
  expect(safeRedirectPath("evil.example")).toBe(DEFAULT_REDIRECT_PATH);
  expect(safeRedirectPath("javascript:alert(1)")).toBe(DEFAULT_REDIRECT_PATH);
});

test("rejects protocol-relative URLs, which start with / but leave the origin", () => {
  expect(safeRedirectPath("//evil.example")).toBe(DEFAULT_REDIRECT_PATH);
  expect(safeRedirectPath("/\\evil.example")).toBe(DEFAULT_REDIRECT_PATH);
});

test("rejects embedded control characters and whitespace", () => {
  // Browsers strip these during URL parsing, so "/\n/evil.example" can
  // resolve to the protocol-relative form after the checks above ran.
  expect(safeRedirectPath("/\n/evil.example")).toBe(DEFAULT_REDIRECT_PATH);
  expect(safeRedirectPath("/\t/evil.example")).toBe(DEFAULT_REDIRECT_PATH);
  expect(safeRedirectPath("/foo bar")).toBe(DEFAULT_REDIRECT_PATH);
});

test("refuses to send someone back to an auth route, which would loop", () => {
  expect(safeRedirectPath("/sign-in")).toBe(DEFAULT_REDIRECT_PATH);
  expect(safeRedirectPath("/sign-in?next=/sign-in")).toBe(DEFAULT_REDIRECT_PATH);
  expect(safeRedirectPath("/sign-up")).toBe(DEFAULT_REDIRECT_PATH);
});

test("withNextParam carries the destination and omits it when it's the default", () => {
  expect(withNextParam("/sign-up", "/items/abc")).toBe("/sign-up?next=%2Fitems%2Fabc");
  expect(withNextParam("/sign-up", DEFAULT_REDIRECT_PATH)).toBe("/sign-up");
});
