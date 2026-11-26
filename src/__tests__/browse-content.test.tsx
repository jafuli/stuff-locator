import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowseContent } from "@/components/browse-content";
import type { StuffListEntry } from "@/components/stuff-list";
import { renderUnderStuffHeader } from "./render-stuff-search";

vi.mock("next/navigation", () => ({ usePathname: () => "/browse" }));

const entries: StuffListEntry[] = [
  { item: { id: "passport", locationId: "bedroom", name: "Passport" }, segments: [{ id: "bedroom", name: "Bedroom" }] },
  { item: { id: "tent", locationId: "garage", name: "Camping tent" }, segments: [{ id: "garage", name: "Garage" }] },
];

const places = <p>The places list</p>;

test("with nothing typed, Browse shows its places", () => {
  renderUnderStuffHeader(<BrowseContent entries={entries} places={places} />);

  expect(screen.getByText("The places list")).toBeDefined();
  expect(screen.queryByText("Passport")).toBeNull();
});

test("typing searches right on Browse: the places give way to matching items, and clearing brings them back", async () => {
  const user = userEvent.setup();
  renderUnderStuffHeader(<BrowseContent entries={entries} places={places} />);
  const field = screen.getByRole("searchbox", { name: "Search your stuff" });

  await user.type(field, "tent");
  expect(screen.queryByText("The places list")).toBeNull();
  expect(screen.getByText("Camping tent")).toBeDefined();
  expect(screen.queryByText("Passport")).toBeNull();
  // Still typing in the same field: the list changed, the header didn't.
  expect(document.activeElement).toBe(field);

  await user.clear(field);
  expect(screen.getByText("The places list")).toBeDefined();
});
