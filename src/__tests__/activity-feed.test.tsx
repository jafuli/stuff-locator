import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ActivityFeed, type ActivityFeedEntry } from "@/components/activity-feed";
import type { Item } from "@/lib/fixtures/types";

const item: Item = {
  id: "spare-house-keys",
  locationId: "garage-closet-toolbox-red-box",
  name: "Spare house keys",
};

test("renders the empty state when there are no entries", () => {
  render(<ActivityFeed entries={[]} />);
  expect(screen.getByText("Nothing has happened yet")).toBeDefined();
});

test("renders an entry with actor, verb, item link, and location breadcrumb links", () => {
  const entries: ActivityFeedEntry[] = [
    {
      event: { id: "spare-house-keys:moved", verb: "moved", actor: "Maayan", item, at: new Date("2026-01-01T00:00:00Z") },
      segments: [
        { id: "garage", name: "Garage" },
        { id: "garage-closet", name: "Closet" },
      ],
    },
  ];
  render(<ActivityFeed entries={entries} />);

  expect(screen.getByText("Maayan")).toBeDefined();
  expect(screen.getByText("moved")).toBeDefined();

  const itemLink = screen.getByRole("link", { name: "Spare house keys" });
  expect(itemLink.getAttribute("href")).toBe("/items/spare-house-keys");

  const breadcrumbLink = screen.getByRole("link", { name: "Garage" });
  expect(breadcrumbLink.getAttribute("href")).toBe("/browse/garage");
});
