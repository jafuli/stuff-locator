import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/page";
import { ITEMS } from "@/lib/fixtures/items";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";

test("renders the home heading and a labelled, non-functional search input", () => {
  render(<Page />);
  expect(screen.getByRole("heading", { level: 1, name: "Our stuff" })).toBeDefined();

  const search = screen.getByRole("searchbox", { name: "Search your stuff" });
  expect(search).toBeDefined();
  expect(search.hasAttribute("disabled")).toBe(false);
});

test("renders every fixture item with its full location path", () => {
  render(<Page />);
  for (const item of ITEMS) {
    expect(screen.getByText(item.name)).toBeDefined();
  }

  // One link per item (its own detail link) plus one link per breadcrumb
  // segment (AC #4 — each segment now navigates to /browse/[id]).
  const breadcrumbLinkCount = ITEMS.reduce(
    (total, item) => total + getBreadcrumbSegments(item.locationId, LOCATIONS).length,
    0,
  );
  expect(screen.getAllByRole("link")).toHaveLength(ITEMS.length + breadcrumbLinkCount);
});

test("a breadcrumb segment under an item links to that location's /browse/[id]", () => {
  render(<Page />);
  // Passport lives at bedroom-filing-box; "Filing box" is the leaf segment.
  const filingBoxLink = screen.getByRole("link", { name: "Filing box" });
  expect(filingBoxLink.getAttribute("href")).toBe("/browse/bedroom-filing-box");
});
