import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/page";

test("home page renders the app name as a heading", () => {
  render(<Page />);
  expect(screen.getByRole("heading", { level: 1, name: "Stuff Locator" })).toBeDefined();
});
