import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Named ErrorBoundary locally — importing the default export as `Error`
// would shadow the global Error class within this file.
import ErrorBoundary from "@/app/activity/error";

test("renders the activity error state with a real heading and calls retry when Retry is clicked", async () => {
  const retry = vi.fn();
  render(<ErrorBoundary error={new Error("boom")} retry={retry} />);

  expect(screen.getByRole("heading", { level: 1, name: "Couldn't load your activity" })).toBeDefined();

  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
