import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Loading from "@/app/loading";

test("renders an accessible loading state for the home route", () => {
  render(<Loading />);
  const region = screen.getByRole("heading", { level: 1, name: "Our stuff" }).closest("main");
  expect(region?.getAttribute("aria-busy")).toBe("true");
  expect(screen.getByText("Loading your stuff…")).toBeDefined();
});
