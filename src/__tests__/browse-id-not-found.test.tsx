import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/app/browse/[id]/not-found";

test("renders a deliberate not-found state with a working way back to Browse", () => {
  render(<NotFound />);

  expect(screen.getByText("Location not found")).toBeDefined();
  expect(screen.getByText("This location doesn't exist — it may have been renamed or removed.")).toBeDefined();

  const backLink = screen.getByRole("link", { name: "Back to Browse" });
  expect(backLink.getAttribute("href")).toBe("/browse");
});
