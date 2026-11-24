import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityEntry } from "@/lib/activity";

const { fetchActivityPage } = vi.hoisted(() => ({ fetchActivityPage: vi.fn() }));
vi.mock("@/lib/activity-page", () => ({ fetchActivityPage }));
vi.mock("@/server/db/client", () => ({ createClient: () => ({}) }));

import { ActivityHistory } from "@/components/activity-history";

const NOW = "2026-11-24T12:00:00.000Z";

function entry(id: string, name: string): ActivityEntry {
  return {
    id,
    kind: "item_added",
    actor: "Noa",
    subjectId: `item-${id}`,
    subjectName: name,
    fromText: null,
    toText: "Garage",
    detailText: null,
    at: new Date("2026-11-24T10:00:00Z"),
  };
}

const FIRST = { entries: [entry("e1", "Passport")], next: { createdAt: "2026-11-24T10:00:00.000001+00:00", id: "e1" } };

beforeEach(() => {
  fetchActivityPage.mockReset();
});

test("a household with nothing older shows no button and no end note", () => {
  render(<ActivityHistory householdId="h1" initial={{ entries: FIRST.entries, next: null }} now={NOW} />);

  expect(screen.queryByRole("button", { name: "Show earlier activity" })).toBeNull();
  expect(screen.queryByText(/That's everything/)).toBeNull();
});

test("'Show earlier activity' appends the next page below, keeps focus on the button and says how many", async () => {
  fetchActivityPage.mockResolvedValue({
    entries: [entry("e2", "Tent"), entry("e3", "Bike pump")],
    next: { createdAt: "2026-11-24T09:00:00+00:00", id: "e3" },
  });
  const user = userEvent.setup();
  render(<ActivityHistory householdId="h1" initial={FIRST} now={NOW} />);

  const button = screen.getByRole("button", { name: "Show earlier activity" });
  await user.click(button);

  expect(fetchActivityPage).toHaveBeenCalledWith(expect.anything(), "h1", FIRST.next);
  const names = screen.getAllByRole("link").map((link) => link.textContent);
  expect(names).toEqual(["Passport", "Tent", "Bike pump"]);
  expect(screen.getByRole("status").textContent).toBe("Showing 2 earlier changes.");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Show earlier activity" }));
});

test("the last page replaces the button with the end note, and focus moves to it", async () => {
  fetchActivityPage.mockResolvedValue({ entries: [entry("e2", "Tent")], next: null });
  const user = userEvent.setup();
  render(<ActivityHistory householdId="h1" initial={FIRST} now={NOW} />);

  await user.click(screen.getByRole("button", { name: "Show earlier activity" }));

  expect(screen.queryByRole("button", { name: "Show earlier activity" })).toBeNull();
  const note = screen.getByText("That's everything: the newest 200 changes are kept.");
  await waitFor(() => {
    expect(document.activeElement).toBe(note);
  });
});

test("a failed load says so and leaves the button to try again", async () => {
  fetchActivityPage.mockRejectedValue(new Error("network down"));
  const user = userEvent.setup();
  render(<ActivityHistory householdId="h1" initial={FIRST} now={NOW} />);

  await user.click(screen.getByRole("button", { name: "Show earlier activity" }));

  expect(screen.getByRole("alert").textContent).toMatch(/couldn't be loaded/);
  expect(screen.getByRole("button", { name: "Show earlier activity" })).toBeDefined();
  expect(screen.getAllByRole("link")).toHaveLength(1);
});
