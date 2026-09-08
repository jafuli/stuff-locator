import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/ui/empty-state";

test("renders title, description, and action when all are supplied", () => {
  render(<EmptyState title="No items yet" description="Stash your first thing." action={<button>Add</button>} />);
  expect(screen.getByText("No items yet")).toBeDefined();
  expect(screen.getByText("Stash your first thing.")).toBeDefined();
  expect(screen.getByRole("button", { name: "Add" })).toBeDefined();
});

test("omits description and action when not supplied", () => {
  render(<EmptyState title="No items yet" />);
  expect(screen.getByText("No items yet")).toBeDefined();
  expect(screen.queryByRole("button")).toBeNull();
});

test("renders the title as plain text with no heading role when titleAs is omitted", () => {
  render(<EmptyState title="No items yet" />);
  expect(screen.queryByRole("heading")).toBeNull();
  expect(screen.getByText("No items yet").tagName).toBe("P");
});

test("renders the title as the specified heading role when titleAs is passed", () => {
  render(<EmptyState title="Couldn't load your stuff" titleAs="h1" />);
  expect(screen.getByRole("heading", { level: 1, name: "Couldn't load your stuff" })).toBeDefined();
});
