import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/items/[id]/edit/page";

function pageProps(id: string) {
  return { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) };
}

test("renders a pre-filled edit form and a back link for a known id", async () => {
  render(await Page(pageProps("passport")));

  expect(screen.getByRole("heading", { level: 1, name: "Edit item" })).toBeDefined();
  expect(screen.getByLabelText("Name")).toHaveProperty("value", "Passport");
  expect(screen.getByLabelText("Detail (optional)")).toHaveProperty("value", "with the birth certificates");

  const backLink = screen.getByRole("link", { name: "‹ Back to item" });
  expect(backLink.getAttribute("href")).toBe("/items/passport");
});

test("calls notFound() for an id with no matching item", async () => {
  await expect(Page(pageProps("does-not-exist"))).rejects.toThrow();
});
