import { expect, test } from "vitest";
import { findReusableInvite } from "@/lib/invite-reuse";

const NOW = new Date("2026-09-15T12:00:00.000Z");

test("returns null when there are no candidates — a new invite should be created", () => {
  expect(findReusableInvite([], NOW)).toBeNull();
});

test("reuses a never-expiring invite (expires_at null)", () => {
  const invite = { code: "abc123", expires_at: null };
  expect(findReusableInvite([invite], NOW)).toBe(invite);
});

test("reuses an invite whose expiry is still in the future", () => {
  const invite = { code: "abc123", expires_at: "2026-09-16T00:00:00.000Z" };
  expect(findReusableInvite([invite], NOW)).toBe(invite);
});

test("does not reuse an invite whose expiry is in the past — a new one should be created", () => {
  const invite = { code: "abc123", expires_at: "2026-09-14T00:00:00.000Z" };
  expect(findReusableInvite([invite], NOW)).toBeNull();
});

test("an expiry exactly equal to now is treated as expired, not reusable", () => {
  const invite = { code: "abc123", expires_at: NOW.toISOString() };
  expect(findReusableInvite([invite], NOW)).toBeNull();
});

test("picks the first reusable candidate, skipping earlier expired ones", () => {
  const expired = { code: "expired", expires_at: "2026-09-14T00:00:00.000Z" };
  const valid = { code: "valid", expires_at: null };
  expect(findReusableInvite([expired, valid], NOW)).toBe(valid);
});
