import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/browse/[id]/page";

// Same isolation approach items-id-page.test.tsx uses: Page is an async
// Server Component that touches no RSC-exclusive APIs, so it can be awaited
// directly and its resolved element rendered.
function pageProps(id: string) {
  return { params: Promise.resolve({ id }), searchParams: Promise.resolve({}) };
}

test("root location: shows its child locations, no items, and a back link to /browse", async () => {
  render(await Page(pageProps("garage")));

  expect(screen.getByRole("heading", { level: 1, name: "Garage" })).toBeDefined();

  expect(screen.getByRole("link", { name: "High shelf" }).getAttribute("href")).toBe("/browse/garage-high-shelf");
  expect(screen.getByRole("link", { name: "Closet" }).getAttribute("href")).toBe("/browse/garage-closet");
  expect(screen.getByRole("link", { name: "Behind the bikes" }).getAttribute("href")).toBe(
    "/browse/garage-behind-the-bikes",
  );

  expect(screen.queryByText("Nothing stored here yet")).toBeNull();

  const backLink = screen.getByRole("link", { name: "‹ Back to Browse" });
  expect(backLink.getAttribute("href")).toBe("/browse");
});

test("mid-tree location: shows its one child location, no items, and a back link to its parent", async () => {
  render(await Page(pageProps("garage-closet-toolbox")));

  expect(screen.getByRole("heading", { level: 1, name: "Toolbox" })).toBeDefined();
  expect(screen.getByText("Garage › Closet › Toolbox")).toBeDefined();

  expect(screen.getByRole("link", { name: "Red box" }).getAttribute("href")).toBe(
    "/browse/garage-closet-toolbox-red-box",
  );

  const backLink = screen.getByRole("link", { name: "‹ Back to Closet" });
  expect(backLink.getAttribute("href")).toBe("/browse/garage-closet");
});

test("leaf location with items: shows the items (via ItemCard) and no child locations", async () => {
  render(await Page(pageProps("garage-closet-toolbox-red-box")));

  expect(screen.getByRole("heading", { level: 1, name: "Red box" })).toBeDefined();
  expect(screen.getByText("Spare house keys")).toBeDefined();
  expect(screen.getByText("Bike multi-tool")).toBeDefined();

  const keysLink = screen.getAllByRole("link").find((link) => link.getAttribute("href") === "/items/spare-house-keys");
  expect(keysLink).toBeDefined();

  const backLink = screen.getByRole("link", { name: "‹ Back to Toolbox" });
  expect(backLink.getAttribute("href")).toBe("/browse/garage-closet-toolbox");
});

test("leaf location with nothing: renders the browse-specific empty state", async () => {
  render(await Page(pageProps("garage-behind-the-bikes")));

  expect(screen.getByRole("heading", { level: 1, name: "Behind the bikes" })).toBeDefined();
  expect(screen.getByText("Nothing stored here yet")).toBeDefined();
  expect(screen.getByText("No items or sub-locations here.")).toBeDefined();

  const backLink = screen.getByRole("link", { name: "‹ Back to Garage" });
  expect(backLink.getAttribute("href")).toBe("/browse/garage");
});

test("calls notFound() for an id with no matching location", async () => {
  await expect(Page(pageProps("does-not-exist"))).rejects.toThrow();
});
