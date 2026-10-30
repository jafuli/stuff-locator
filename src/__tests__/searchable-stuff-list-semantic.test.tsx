import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchableStuffList, SHORTLIST_SIZE } from "@/components/searchable-stuff-list";
import type { StuffListEntry } from "@/components/stuff-list";
import type { Item } from "@/lib/fixtures/types";

// The hook is mocked so each test can decide what the model "says"; the hook
// itself, and the client under it, have their own tests.
const search = vi.hoisted(() => ({
  semanticOrder: null as string[] | null,
  status: "idle",
  onIntent: vi.fn(),
  lastDocuments: [] as { id: string; name: string; enriched: string }[],
}));
vi.mock("@/lib/search/use-semantic-search", () => ({
  useSemanticSearch: (documents: { id: string; name: string; enriched: string }[]) => {
    search.lastDocuments = documents;
    return { semanticOrder: search.semanticOrder, status: search.status, onIntent: search.onIntent };
  },
}));

function item(id: string, name: string, detail?: string): Item {
  return { id, locationId: `${id}-loc`, name, detail };
}

const passport = item("passport", "Passport", "with the birth certificates");
const tent = item("tent", "Camping tent");
const router = item("router", "Spare router");
const keys = item("keys", "Allen keys");

function entriesOf(...items: Item[]): StuffListEntry[] {
  return items.map((i) => ({ item: i, segments: [{ id: `${i.id}-room`, name: "Garage" }] }));
}

function rowNames(): string[] {
  // Each row's title is the text-title span inside its link.
  return screen.getAllByRole("link", { name: /.+/ }).flatMap((link) => {
    const title = link.querySelector(".text-title");
    return title?.textContent ? [title.textContent] : [];
  });
}

beforeEach(() => {
  search.semanticOrder = null;
  search.status = "idle";
  search.onIntent.mockClear();
});

test("builds each document from the item and its location path", () => {
  render(<SearchableStuffList entries={entriesOf(passport, tent)} />);
  expect(search.lastDocuments).toEqual([
    { id: "passport", name: "Passport", enriched: "Passport · Garage · with the birth certificates" },
    { id: "tent", name: "Camping tent", enriched: "Camping tent · Garage" },
  ]);
});

test("focusing the field, and typing, signal intent so the model can start", async () => {
  const user = userEvent.setup();
  render(<SearchableStuffList entries={entriesOf(passport, tent)} />);
  expect(search.onIntent).not.toHaveBeenCalled();

  await user.click(screen.getByRole("searchbox", { name: "Search your stuff" }));
  expect(search.onIntent).toHaveBeenCalledTimes(1);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "a");
  expect(search.onIntent).toHaveBeenCalledTimes(2);
});

test("without a semantic order the substring filter serves, including No matches", async () => {
  const user = userEvent.setup();
  search.status = "loading";
  render(<SearchableStuffList entries={entriesOf(passport, tent)} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "travel documents");

  expect(screen.getByText("No matches")).toBeDefined();
  expect(screen.queryByText(/Nothing else close/)).toBeNull();
});

test("with a semantic order, a query sharing no words with the item still finds it", async () => {
  const user = userEvent.setup();
  search.status = "ready";
  search.semanticOrder = ["passport", "router", "tent", "keys"];
  render(<SearchableStuffList entries={entriesOf(tent, router, passport, keys)} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "travel documents");

  expect(rowNames()).toEqual(["Passport", "Spare router", "Camping tent", "Allen keys"]);
  expect(screen.queryByText("No matches")).toBeNull();
});

test("the CLOSEST marker sits on the real top rank, not on the page's first item", async () => {
  const user = userEvent.setup();
  search.status = "ready";
  search.semanticOrder = ["passport", "tent"];
  render(<SearchableStuffList entries={entriesOf(tent, passport)} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "travel documents");

  const closest = screen.getAllByText("Closest");
  expect(closest).toHaveLength(1);
  expect(within(closest[0]?.closest("a") ?? document.body).getByText("Passport")).toBeDefined();
});

test("substring hits are pinned above better semantic matches", async () => {
  const user = userEvent.setup();
  search.status = "ready";
  // By meaning the router is closest to "tent"; by letters only the tent matches.
  search.semanticOrder = ["router", "tent", "passport"];
  render(<SearchableStuffList entries={entriesOf(passport, tent, router)} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "tent");

  expect(rowNames()).toEqual(["Camping tent", "Spare router", "Passport"]);
});

test(`the ranked list is a shortlist of ${SHORTLIST_SIZE.toString()}, cut by rank and not by score`, async () => {
  const user = userEvent.setup();
  search.status = "ready";
  const many = Array.from({ length: 9 }, (_, i) => item(`i${i.toString()}`, `Thing ${i.toString()}`));
  search.semanticOrder = [...many].reverse().map((i) => i.id);
  render(<SearchableStuffList entries={entriesOf(...many)} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "zzz");

  expect(rowNames()).toEqual(["Thing 8", "Thing 7", "Thing 6", "Thing 5", "Thing 4"]);
  expect(screen.getByRole("status").textContent).toBe("5 results found");
});

test("every substring hit is kept even when there are more than the shortlist", async () => {
  const user = userEvent.setup();
  search.status = "ready";
  const many = Array.from({ length: 8 }, (_, i) => item(`i${i.toString()}`, `Box ${i.toString()}`));
  search.semanticOrder = many.map((i) => i.id);
  render(<SearchableStuffList entries={entriesOf(...many)} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "box");

  expect(rowNames()).toHaveLength(8);
});

test("the closing line points to Browse instead of a No matches screen", async () => {
  const user = userEvent.setup();
  search.status = "ready";
  search.semanticOrder = ["passport", "tent"];
  render(<SearchableStuffList entries={entriesOf(passport, tent)} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "xyz nothing like it");

  expect(screen.getByText(/Nothing else close/)).toBeDefined();
  expect(screen.getByRole("link", { name: "browse by place" }).getAttribute("href")).toBe("/browse");
  expect(screen.queryByText("No matches")).toBeNull();
});

test("a ranked result never shows a score", async () => {
  const user = userEvent.setup();
  search.status = "ready";
  search.semanticOrder = ["passport", "tent"];
  const { container } = render(<SearchableStuffList entries={entriesOf(passport, tent)} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "travel documents");

  expect(container.textContent).not.toMatch(/\d\.\d{2}|%|score/i);
});

test("while the model loads, a quiet note goes to assistive tech only", async () => {
  const user = userEvent.setup();
  search.status = "loading";
  render(<SearchableStuffList entries={entriesOf(passport, tent)} />);

  expect(screen.queryByText(/Loading smarter search/)).toBeNull();

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "pass");

  const note = screen.getByText(/Loading smarter search/);
  expect(note.className).toContain("sr-only");
  expect(note.getAttribute("role")).toBeNull();
  // The result-count status stays the only role="status".
  expect(screen.getAllByRole("status")).toHaveLength(1);
});

test("a failed or skipped model is silent: falling back is not an error", async () => {
  const user = userEvent.setup();
  for (const status of ["failed", "skipped"] as const) {
    search.status = status;
    const { unmount } = render(<SearchableStuffList entries={entriesOf(passport, tent)} />);
    await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "pass");
    expect(screen.queryByText(/smarter search/i)).toBeNull();
    expect(screen.getByText("Passport")).toBeDefined();
    unmount();
  }
});
