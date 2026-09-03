import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/page";
import { ITEMS } from "@/lib/fixtures/items";

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
  expect(screen.getAllByRole("link")).toHaveLength(ITEMS.length);
});
