import { expect, test } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MarketingHome } from "@/components/marketing-home";

test("has exactly one h1, phrased as the screen's question", () => {
  render(<MarketingHome />);
  const headings = screen.getAllByRole("heading", { level: 1 });
  expect(headings).toHaveLength(1);
  expect(headings[0]?.textContent).toBe("Where did we put the passports?");
});

test("the only links are Sign in and Sign up, pointing at their pages", () => {
  render(<MarketingHome />);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/sign-in");
  expect(screen.getByRole("link", { name: "Sign up" }).getAttribute("href")).toBe("/sign-up");
});

test("the sign-in link sits in the header landmark, the rest in main", () => {
  render(<MarketingHome />);
  expect(within(screen.getByRole("banner")).getByRole("link", { name: "Sign in" })).toBeDefined();
  expect(within(screen.getByRole("main")).getByRole("link", { name: "Sign up" })).toBeDefined();
});

test("the sample rows show their names, details and paths, and none of them is a link", () => {
  render(<MarketingHome />);
  const example = screen.getByRole("region", { name: "For example" });
  expect(within(example).queryByRole("link")).toBeNull();
  expect(example.textContent).toContain("Passports (both)");
  expect(example.textContent).toContain("In the blue folder");
  expect(example.textContent).toContain("Bedroom › Desk › Top drawer");
  expect(example.textContent).toContain("Hallway › Shoe cabinet › Small tin");
  // Like the real list: no "who, when" line.
  expect(example.textContent).not.toMatch(/ago/);
});

test("has no CLOSEST marker — there's no search to be closest to", () => {
  render(<MarketingHome />);
  expect(screen.queryByText("Closest")).toBeNull();
});
