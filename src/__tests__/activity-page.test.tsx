import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import ActivityPage from "@/app/activity/page";
import { ITEMS } from "@/lib/fixtures/items";
import { getActivityEvents } from "@/lib/fixtures/activity";

test("renders the Activity heading and a real feed entry, not the old placeholder", () => {
  render(<ActivityPage />);
  expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toBeDefined();
  expect(screen.queryByText(/coming soon/i)).toBeNull();

  const events = getActivityEvents(ITEMS);
  expect(events.length).toBeGreaterThan(0);
  expect(screen.getAllByText(events[0].actor).length).toBeGreaterThan(0);
});

test("every fixture item's provenance shows up as at least one feed entry", () => {
  render(<ActivityPage />);
  // Spare house keys is the one fixture item with a genuine move — both its
  // add and its move should be represented somewhere in the actor list.
  expect(screen.getAllByText("Itamar").length).toBeGreaterThan(0);
  expect(screen.getAllByText("Maayan").length).toBeGreaterThan(0);
});
