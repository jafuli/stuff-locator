import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import ActivityPage from "@/app/activity/page";

test("renders the activity placeholder heading and coming-soon copy", () => {
  render(<ActivityPage />);
  expect(screen.getByRole("heading", { level: 1, name: "Activity" })).toBeDefined();
  expect(screen.getByText(/coming soon/i)).toBeDefined();
});
