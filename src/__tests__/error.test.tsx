import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Named ErrorBoundary locally — importing the default export as `Error`
// would shadow the global Error class within this file.
import ErrorBoundary from "@/app/error";

test("renders the error state and calls reset when Retry is clicked", async () => {
  const reset = vi.fn();
  render(<ErrorBoundary error={new Error("boom")} reset={reset} />);

  expect(screen.getByText("Couldn't load your stuff")).toBeDefined();

  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(reset).toHaveBeenCalledTimes(1);
});
