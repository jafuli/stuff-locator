import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { StuffScreenSkeleton } from "@/components/stuff-screen-skeleton";
import BrowseLoading from "@/app/(app)/browse/loading";
import { STUFF_PATH } from "@/lib/routes";

test("renders an accessible loading state for the home route", () => {
  render(<StuffScreenSkeleton />);
  const region = screen.getByRole("heading", { level: 1, name: "What are you looking for?" }).closest("main");
  expect(region?.getAttribute("aria-busy")).toBe("true");
  expect(screen.getByText("Loading your stuff…")).toBeDefined();
});

// Switching All <-> By place shows one of these two while the next page loads.
// Both draw the loaded header (Stash, the chips, the search field's look), so
// nothing above the list appears, disappears or changes shape in between.
for (const [name, Skeleton, current] of [
  ["Stuff", StuffScreenSkeleton, "All (…)"],
  ["Browse", BrowseLoading, "By place"],
] as const) {
  test(`the ${name} loading state keeps the real header: Stash, both chips, the search field's look`, () => {
    const { container } = render(<Skeleton />);

    expect(screen.getByRole("link", { name: "Stash" }).getAttribute("href")).toBe("/items/new");
    expect(screen.getByRole("link", { name: "All (…)" }).getAttribute("href")).toBe(STUFF_PATH);
    expect(screen.getByRole("link", { name: "By place" }).getAttribute("href")).toBe("/browse");
    expect(screen.getByRole("link", { name: current }).getAttribute("aria-current")).toBe("page");
    // Not a pulsing box: the field's own border, shadow and placeholder text.
    expect(container.querySelector(".animate-pulse.rounded-control")).toBeNull();
    expect(screen.getByText("Search…").className).toContain("shadow-control");
  });
}
