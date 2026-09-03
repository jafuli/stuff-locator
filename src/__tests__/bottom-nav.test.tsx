import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomNav, isTabActive, type NavTab } from "@/components/bottom-nav";

test("isTabActive matches the exact path", () => {
  expect(isTabActive("/stuff", "/stuff")).toBe(true);
});

test("isTabActive matches a nested path", () => {
  expect(isTabActive("/stuff", "/stuff/42")).toBe(true);
});

test("isTabActive does not false-positive on a sibling with a shared prefix", () => {
  expect(isTabActive("/stuff", "/stuffing")).toBe(false);
});

test("isTabActive rejects an unrelated path", () => {
  expect(isTabActive("/stuff", "/activity")).toBe(false);
});

const tabs: NavTab[] = [
  { href: "/stuff", label: "Stuff" },
  { href: "/activity", label: "Activity" },
];

test("marks only the active tab with aria-current", () => {
  render(<BottomNav tabs={tabs} activePath="/activity" />);
  expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Stuff" }).getAttribute("aria-current")).toBeNull();
});
