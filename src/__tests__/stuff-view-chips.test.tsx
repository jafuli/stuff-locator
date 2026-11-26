import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { StuffViewChips } from "@/components/stuff-view-chips";
import { STUFF_PATH } from "@/lib/routes";

test("plain 'All' and 'By place' links — the count lives in the line above the list now", () => {
  render(<StuffViewChips active="all" />);

  expect(screen.getByRole("link", { name: "All" }).getAttribute("href")).toBe(STUFF_PATH);
  expect(screen.getByRole("link", { name: "By place" }).getAttribute("href")).toBe("/browse");
});

test("All is the current page on Home, and only it", () => {
  render(<StuffViewChips active="all" />);

  expect(screen.getByRole("link", { name: "All" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "By place" }).hasAttribute("aria-current")).toBe(false);
});

test("By place is the current page on Browse, and only it", () => {
  render(<StuffViewChips active="place" />);

  expect(screen.getByRole("link", { name: "By place" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "All" }).hasAttribute("aria-current")).toBe(false);
});

test("the chips are links in a labelled nav with 44px touch targets", () => {
  render(<StuffViewChips active="all" />);

  expect(screen.getByRole("navigation", { name: "Stuff view" })).toBeDefined();
  for (const link of screen.getAllByRole("link")) {
    expect(link.className).toContain("min-h-target-min");
  }
});
