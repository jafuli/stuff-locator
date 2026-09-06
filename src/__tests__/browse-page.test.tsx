import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/browse/page";
import { LOCATIONS } from "@/lib/fixtures/locations";

test("renders the Browse heading and every fixture root location as a link", () => {
  render(<Page />);
  expect(screen.getByRole("heading", { level: 1, name: "Browse" })).toBeDefined();

  const roots = LOCATIONS.filter((location) => location.parentId === null);
  for (const root of roots) {
    const link = screen.getByRole("link", { name: root.name });
    expect(link.getAttribute("href")).toBe(`/browse/${root.id}`);
  }
});

test("has a way back to the home stuff list", () => {
  render(<Page />);
  const backLink = screen.getByRole("link", { name: "‹ Back to Stuff" });
  expect(backLink.getAttribute("href")).toBe("/");
});
