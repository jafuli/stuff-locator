import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { StuffViewChips } from "@/components/stuff-view-chips";

test("shows 'All (n)' with the household total and a 'By place' link", () => {
  render(<StuffViewChips total={18} active="all" />);

  expect(screen.getByRole("link", { name: "All (18)" }).getAttribute("href")).toBe("/");
  expect(screen.getByRole("link", { name: "By place" }).getAttribute("href")).toBe("/browse");
});

test("All is the current page on Home, and only it", () => {
  render(<StuffViewChips total={3} active="all" />);

  expect(screen.getByRole("link", { name: "All (3)" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "By place" }).hasAttribute("aria-current")).toBe(false);
});

test("By place is the current page on Browse, and only it", () => {
  render(<StuffViewChips total={3} active="place" />);

  expect(screen.getByRole("link", { name: "By place" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "All (3)" }).hasAttribute("aria-current")).toBe(false);
});

test("an empty household reads All (0), not a missing count", () => {
  render(<StuffViewChips total={0} active="all" />);
  expect(screen.getByRole("link", { name: "All (0)" })).toBeDefined();
});

test("the chips are links in a labelled nav with 44px touch targets", () => {
  render(<StuffViewChips total={1} active="all" />);

  expect(screen.getByRole("navigation", { name: "Stuff view" })).toBeDefined();
  for (const link of screen.getAllByRole("link")) {
    expect(link.className).toContain("min-h-11");
  }
});
