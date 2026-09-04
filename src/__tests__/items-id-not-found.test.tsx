import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/app/items/[id]/not-found";

test("renders a deliberate not-found state with a working way back to the list", () => {
  render(<NotFound />);

  expect(screen.getByText("Item not found")).toBeDefined();
  expect(screen.getByText("It may have been moved or removed.")).toBeDefined();

  const backLink = screen.getByRole("link", { name: "Back to Stuff" });
  expect(backLink.getAttribute("href")).toBe("/");
});
