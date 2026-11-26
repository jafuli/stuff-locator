import { expect, test, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CountLine } from "@/components/count-line";
import { PLACES, THINGS } from "@/lib/limits";
import { renderUnderStuffHeader } from "./render-stuff-search";

vi.mock("next/navigation", () => ({ usePathname: () => "/stuff" }));

test("counts the household's things above the list", () => {
  renderUnderStuffHeader(<CountLine count={37} max={100} noun={THINGS} />);
  expect(screen.getByText("37 things")).toBeDefined();
});

test("near and at the limit, on the places line too", () => {
  const { unmount } = renderUnderStuffHeader(<CountLine count={92} max={100} noun={PLACES} />);
  expect(screen.getByText("92 of 100 places")).toBeDefined();
  unmount();

  renderUnderStuffHeader(<CountLine count={100} max={100} noun={THINGS} />);
  expect(screen.getByText("Limit reached: 100 of 100 things")).toBeDefined();
});

test("hidden while a search is typed (the list is results then) and at zero", async () => {
  const user = userEvent.setup();
  const { unmount } = renderUnderStuffHeader(<CountLine count={37} max={100} noun={THINGS} />);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "tent");
  expect(screen.queryByText("37 things")).toBeNull();
  unmount();

  renderUnderStuffHeader(<CountLine count={0} max={100} noun={THINGS} />);
  expect(screen.queryByText(/things/)).toBeNull();
});
