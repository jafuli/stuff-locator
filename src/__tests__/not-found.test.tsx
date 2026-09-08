import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import NotFound from "@/app/not-found";

test("renders a deliberate global not-found state with a real heading and a working way back to Stuff", () => {
  render(<NotFound />);

  expect(screen.getByRole("heading", { level: 1, name: "Page not found" })).toBeDefined();
  expect(screen.getByText("That link doesn't go anywhere. It may be a typo or an old bookmark.")).toBeDefined();

  const backLink = screen.getByRole("link", { name: "Back to Stuff" });
  expect(backLink.getAttribute("href")).toBe("/");
});
