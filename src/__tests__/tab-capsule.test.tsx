import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TabCapsule, isTabActive, type NavTab } from "@/components/tab-capsule";

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
  { href: "/stuff", label: "Stuff", icon: "box" },
  { href: "/activity", label: "Activity", icon: "clock" },
];

test("marks only the active tab with aria-current", () => {
  render(<TabCapsule tabs={tabs} activePath="/activity" />);
  expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Stuff" }).getAttribute("aria-current")).toBeNull();
});

test("is a nav of links, not a tablist, so it announces as page navigation", () => {
  render(<TabCapsule tabs={tabs} activePath="/stuff" />);
  expect(screen.getByRole("navigation", { name: "Primary" })).toBeDefined();
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.queryByRole("tab")).toBeNull();
});

test("each tab's icon is decorative — the visible label is the name", () => {
  render(<TabCapsule tabs={tabs} activePath="/stuff" />);
  for (const link of screen.getAllByRole("link")) {
    const icon = link.querySelector("svg");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
  }
});
