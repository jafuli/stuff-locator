import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
// Named ErrorBoundary locally — importing the default export as `Error`
// would shadow the global Error class within this file.
import ErrorBoundary from "@/app/(app)/(stuff-views)/browse/error";

test("renders the Browse error state with its own heading under the shared h1, and calls retry when Retry is clicked", async () => {
  const retry = vi.fn();
  render(<ErrorBoundary error={new Error("boom")} retry={retry} />);

  // The shared header (StuffViewsShell) supplies the page's h1 and <main>.
  expect(screen.queryByRole("main")).toBeNull();
  expect(screen.getByRole("heading", { level: 2, name: "Couldn't load rooms" })).toBeDefined();

  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledTimes(1);
});
