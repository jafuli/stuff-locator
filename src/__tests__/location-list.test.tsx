import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocationList } from "@/components/location-list";
import type { Location } from "@/lib/fixtures/types";

const locations: Location[] = [
  { id: "garage", parentId: null, name: "Garage" },
  { id: "office", parentId: null, name: "Office" },
];

test("renders one link per location, each pointing at /browse/[id]", () => {
  render(<LocationList locations={locations} />);
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(2);
  expect(screen.getByRole("link", { name: "Garage" }).getAttribute("href")).toBe("/browse/garage");
  expect(screen.getByRole("link", { name: "Office" }).getAttribute("href")).toBe("/browse/office");
});

test("renders nothing for an empty list", () => {
  const { container } = render(<LocationList locations={[]} />);
  expect(container.firstChild).toBeNull();
});
