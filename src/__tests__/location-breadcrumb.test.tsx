import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";

test("joins path segments with the wireframe's separator", () => {
  render(<LocationBreadcrumb path={["Garage", "Closet", "Toolbox", "Red box"]} />);
  expect(screen.getByText("Garage › Closet › Toolbox › Red box")).toBeDefined();
});

test("renders nothing for an empty path", () => {
  const { container } = render(<LocationBreadcrumb path={[]} />);
  expect(container.firstChild).toBeNull();
});
