import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { StuffSearchResults } from "@/components/stuff-search-results";
import { renderUnderStuffHeader } from "./render-stuff-search";
import type { StuffListEntry } from "@/components/stuff-list";
import type { Item } from "@/lib/fixtures/types";

// The shared header marks the chip for the current route.
vi.mock("next/navigation", () => ({ usePathname: () => "/stuff" }));

const passport: Item = {
  id: "passport",
  locationId: "bedroom-filing-box",
  name: "Passport",
  detail: "with the birth certificates",
};
const tent: Item = { id: "camping-tent", locationId: "garage-high-shelf", name: "Camping tent" };

const entries: StuffListEntry[] = [
  { item: passport, segments: [{ id: "bedroom", name: "Bedroom" }] },
  { item: tent, segments: [{ id: "garage", name: "Garage" }] },
];

test("typing a query that matches one item narrows the visible list", async () => {
  const user = userEvent.setup();
  renderUnderStuffHeader(<StuffSearchResults entries={entries} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "tent");

  expect(screen.getByText("Camping tent")).toBeDefined();
  expect(screen.queryByText("Passport")).toBeNull();
});

test("one or two letters already reach an item's place: 'of' finds what's in the Office", async () => {
  const user = userEvent.setup();
  const keys: Item = { id: "keys", locationId: "office-cabinet", name: "Spare keys" };
  renderUnderStuffHeader(
    <StuffSearchResults
      entries={[
        ...entries,
        {
          item: keys,
          segments: [
            { id: "office", name: "Office" },
            { id: "office-cabinet", name: "Cabinet" },
          ],
        },
      ]}
    />,
  );

  // Below the model's 3-character minimum: letters are all of Find here.
  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "of");

  expect(screen.getByText("Spare keys")).toBeDefined();
  expect(screen.queryByText("Passport")).toBeNull();
  expect(screen.queryByText("Camping tent")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("1 result found");
});

test("a query matching nothing shows the no-matches empty state", async () => {
  const user = userEvent.setup();
  renderUnderStuffHeader(<StuffSearchResults entries={entries} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "nonexistent");

  expect(screen.getByText("No matches")).toBeDefined();
  expect(screen.queryByText("Passport")).toBeNull();
  expect(screen.queryByText("Camping tent")).toBeNull();
});

test("clearing the input restores the full list", async () => {
  const user = userEvent.setup();
  renderUnderStuffHeader(<StuffSearchResults entries={entries} />);

  const search = screen.getByRole("searchbox", { name: "Search your stuff" });
  await user.type(search, "tent");
  expect(screen.queryByText("Passport")).toBeNull();

  await user.clear(search);
  expect(screen.getByText("Passport")).toBeDefined();
  expect(screen.getByText("Camping tent")).toBeDefined();
});

test("narrowing the list announces the result count via a status region", async () => {
  const user = userEvent.setup();
  renderUnderStuffHeader(<StuffSearchResults entries={entries} />);

  expect(screen.getByRole("status").textContent).toBe("");

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "tent");
  expect(screen.getByRole("status").textContent).toBe("1 result found");
});

test("a query matching nothing announces zero results via the status region", async () => {
  const user = userEvent.setup();
  renderUnderStuffHeader(<StuffSearchResults entries={entries} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "nonexistent");
  expect(screen.getByRole("status").textContent).toBe("0 results found");
});

test("forwards emptyStateAction to StuffList's zero-entries empty state, not the no-matches one", async () => {
  const user = userEvent.setup();
  renderUnderStuffHeader(
    <StuffSearchResults entries={[]} emptyStateAction={<Link href="/items/new">Stash your first item</Link>} />,
  );
  // Zero total entries, no query typed — StuffList's own empty state, with
  // the action.
  expect(screen.getByRole("link", { name: "Stash your first item" })).toBeDefined();

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "anything");
  // A search that matches nothing shows a *different* empty state
  // ("No matches") — the CTA belongs to "you have no items", not "your
  // search found nothing", so it must not appear here.
  expect(screen.getByText("No matches")).toBeDefined();
  expect(screen.queryByRole("link", { name: "Stash your first item" })).toBeNull();
});

test("the All chip is current on the Stuff screen and the count is not in it any more", () => {
  renderUnderStuffHeader(<StuffSearchResults entries={entries} />);

  expect(screen.getByRole("link", { name: "All" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "By place" }).getAttribute("href")).toBe("/browse");
});

test("the field is not focused on load (no stolen focus)", () => {
  renderUnderStuffHeader(<StuffSearchResults entries={entries} />);

  expect(document.activeElement).toBe(document.body);
});
