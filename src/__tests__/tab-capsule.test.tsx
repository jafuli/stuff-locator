import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { TabCapsule, isTabActive, type NavTab } from "@/components/tab-capsule";
import { NAV_TABS } from "@/lib/nav-tabs";

test("isTabActive matches the exact path", () => {
  expect(isTabActive({ href: "/stuff" }, "/stuff")).toBe(true);
});

test("isTabActive matches a nested path", () => {
  expect(isTabActive({ href: "/stuff" }, "/stuff/42")).toBe(true);
});

test("isTabActive does not false-positive on a sibling with a shared prefix", () => {
  expect(isTabActive({ href: "/stuff" }, "/stuffing")).toBe(false);
});

test("isTabActive rejects an unrelated path", () => {
  expect(isTabActive({ href: "/stuff" }, "/activity")).toBe(false);
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

describe("a tab can claim other paths (Stuff stands for Browse too)", () => {
  const stuffTab = { href: "/stuff", matches: ["/browse"] };

  test("its claimed path and everything under it", () => {
    expect(isTabActive(stuffTab, "/browse")).toBe(true);
    expect(isTabActive(stuffTab, "/browse/0b5c7d8e-1a2b-4c3d-9e8f-123456789abc")).toBe(true);
    // Its own href still counts.
    expect(isTabActive(stuffTab, "/stuff")).toBe(true);
  });

  test("keeps the sibling guard for claimed paths too", () => {
    expect(isTabActive(stuffTab, "/browser")).toBe(false);
  });

  test("the real Stuff tab is current on Browse, but not on an item's page or on Activity", () => {
    const stuff = NAV_TABS.find((tab) => tab.label === "Stuff");
    if (!stuff) {
      throw new Error("no Stuff tab");
    }
    expect(isTabActive(stuff, "/browse")).toBe(true);
    expect(isTabActive(stuff, "/browse/abc")).toBe(true);
    expect(isTabActive(stuff, "/items/abc")).toBe(false);
    expect(isTabActive(stuff, "/items/new")).toBe(false);
    expect(isTabActive(stuff, "/activity")).toBe(false);
  });

  test("the capsule marks Stuff current on a Browse page", () => {
    render(<TabCapsule tabs={NAV_TABS} activePath="/browse/abc" />);
    expect(screen.getByRole("link", { name: "Stuff" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBeNull();
  });
});
