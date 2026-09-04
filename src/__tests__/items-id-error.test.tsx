import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Named ErrorBoundary locally — importing the default export as `Error`
// would shadow the global Error class within this file.
import ErrorBoundary from "@/app/items/[id]/error";

test("renders the item-detail error state and calls retry when Retry is clicked", async () => {
  const retry = vi.fn();
  render(<ErrorBoundary error={new Error("boom")} retry={retry} />);

  expect(screen.getByText("Couldn't load this item")).toBeDefined();

  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
