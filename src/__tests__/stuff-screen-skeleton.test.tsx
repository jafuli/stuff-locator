import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { StuffScreenSkeleton } from "@/components/stuff-screen-skeleton";

test("renders an accessible loading state for the home route", () => {
  render(<StuffScreenSkeleton />);
  const region = screen.getByRole("heading", { level: 1, name: "What are you looking for?" }).closest("main");
  expect(region?.getAttribute("aria-busy")).toBe("true");
  expect(screen.getByText("Loading your stuff…")).toBeDefined();
});
