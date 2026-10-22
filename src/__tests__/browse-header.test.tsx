import { beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { BrowseHeader } from "@/components/browse-header";

beforeEach(() => {
  push.mockReset();
});

test("shows the same header Home has: title, search, and the chips with By place current", () => {
  render(<BrowseHeader total={12} />);

  expect(screen.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeDefined();
  expect(screen.getByRole("searchbox", { name: "Search your stuff" })).toBeDefined();
  expect(screen.getByRole("link", { name: "All (12)" })).toBeDefined();
  expect(screen.getByRole("link", { name: "By place" }).getAttribute("aria-current")).toBe("page");
});

test("typing sends the query to Home, encoded", async () => {
  const user = userEvent.setup();
  render(<BrowseHeader total={1} />);

  await user.type(screen.getByRole("searchbox"), "t");
  expect(push).toHaveBeenLastCalledWith("/?q=t");

  await user.type(screen.getByRole("searchbox"), " & a");
  expect(push).toHaveBeenLastCalledWith("/?q=t%20%26%20a");
});

test("characters typed before the navigation lands are kept in the field", async () => {
  const user = userEvent.setup();
  render(<BrowseHeader total={1} />);

  await user.type(screen.getByRole("searchbox"), "tent");

  expect(screen.getByRole<HTMLInputElement>("searchbox").value).toBe("tent");
});
