import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";

const segments = [
  { id: "garage", name: "Garage" },
  { id: "garage-closet", name: "Closet" },
  { id: "garage-closet-toolbox", name: "Toolbox" },
  { id: "garage-closet-toolbox-red-box", name: "Red box" },
];

test("joins segment names with the wireframe's separator", () => {
  render(<LocationBreadcrumb segments={segments} />);
  expect(screen.getByText("Garage › Closet › Toolbox › Red box")).toBeDefined();
});

test("renders nothing for an empty path", () => {
  const { container } = render(<LocationBreadcrumb segments={[]} />);
  expect(container.firstChild).toBeNull();
});

test("renders plain text, not links, when linked is omitted", () => {
  render(<LocationBreadcrumb segments={segments} />);
  expect(screen.queryByRole("link")).toBeNull();
});

test("renders each segment as a link to /browse/[id] when linked", () => {
  const { container } = render(<LocationBreadcrumb segments={segments} linked />);

  // The visible, concatenated text still reads the same as the unlinked
  // form — checked via the container's full textContent, since getByText's
  // default matcher only looks at an element's direct text-node children,
  // and here every segment is now wrapped in its own <span>/<a>.
  expect(container.textContent).toBe("Garage › Closet › Toolbox › Red box");

  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(segments.length);
  segments.forEach((segment, index) => {
    expect(links[index].textContent).toBe(segment.name);
    expect(links[index].getAttribute("href")).toBe(`/browse/${segment.id}`);
  });
});
