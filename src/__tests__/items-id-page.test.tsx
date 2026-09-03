import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/items/[id]/page";

// Page is an async Server Component that touches no RSC-exclusive APIs
// (no fetch, no cookies/headers), so it can be awaited directly and its
// resolved element rendered — same isolation approach error.test.tsx and
// loading.test.tsx already use for their route-level components.
function pageProps(id: string) {
  return { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) };
}

test("renders full item detail, breadcrumb, and a back link for a known id", async () => {
  render(await Page(pageProps("passport")));

  expect(screen.getByRole("heading", { level: 1, name: "Passport" })).toBeDefined();
  expect(screen.getByText("Bedroom › Filing box")).toBeDefined();
  expect(screen.getByText("with the birth certificates")).toBeDefined();

  const backLink = screen.getByRole("link", { name: "‹ Back to Stuff" });
  expect(backLink.getAttribute("href")).toBe("/");
});

test("calls notFound() for an id with no matching item", async () => {
  await expect(Page(pageProps("does-not-exist"))).rejects.toThrow();
});
