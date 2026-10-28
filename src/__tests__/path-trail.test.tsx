import { afterEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PathTrail } from "@/components/path-trail";

const segments = [
  { id: "garage", name: "Garage" },
  { id: "garage-closet", name: "Closet" },
  { id: "garage-closet-toolbox", name: "Toolbox" },
  { id: "garage-closet-toolbox-red-box", name: "Red box" },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

/** jsdom has no matchMedia; this makes the "(max-width: 359px)" query report `narrow`. */
function stubViewport(narrow: boolean) {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: narrow && query.includes("max-width: 359px"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

test("reads root to leaf with › separators", () => {
  const { container } = render(<PathTrail segments={segments} />);
  expect(container.textContent).toBe("Garage › Closet › Toolbox › Red box");
});

test("renders nothing for an empty path", () => {
  const { container } = render(<PathTrail segments={[]} />);
  expect(container.firstChild).toBeNull();
});

test("only the last segment is on tape", () => {
  render(<PathTrail segments={segments} />);
  const onTape = (name: string) => screen.getByText(name).className.includes("bg-tape");
  expect(onTape("Red box")).toBe(true);
  for (const name of ["Garage", "Closet", "Toolbox"]) {
    expect(onTape(name)).toBe(false);
  }
});

test("a one-segment path is just the tape — no separator", () => {
  const { container } = render(<PathTrail segments={[{ id: "garage", name: "Garage" }]} />);
  expect(container.textContent).toBe("Garage");
  expect(screen.getByText("Garage").className).toContain("bg-tape");
});

test("separators are decorative so assistive tech reads names, not arrows", () => {
  const { container } = render(<PathTrail segments={segments} />);
  const separators = container.querySelectorAll('[aria-hidden="true"]');
  expect(separators).toHaveLength(segments.length - 1);
});

test("renders plain text, not links, when linked is omitted", () => {
  render(<PathTrail segments={segments} />);
  expect(screen.queryByRole("link")).toBeNull();
});

test("renders each segment as a link to /browse/[id] when linked", () => {
  const { container } = render(<PathTrail segments={segments} linked />);
  expect(container.textContent).toBe("Garage › Closet › Toolbox › Red box");
  const links = screen.getAllByRole("link");
  expect(links).toHaveLength(segments.length);
  segments.forEach((segment, index) => {
    expect(links[index].textContent).toBe(segment.name);
    expect(links[index].getAttribute("href")).toBe(`/browse/${segment.id}`);
  });
});

test("printIn animates the tape only; without it nothing animates", () => {
  const { rerender } = render(<PathTrail segments={segments} />);
  expect(screen.getByText("Red box").className).not.toContain("animate-tape-print");
  rerender(<PathTrail segments={segments} printIn />);
  expect(screen.getByText("Red box").className).toContain("animate-tape-print");
  expect(screen.getByText("Garage").className).not.toContain("animate-tape-print");
});

test("on a wide screen nothing is collapsed", () => {
  stubViewport(false);
  render(<PathTrail segments={segments} />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText("Closet")).toBeDefined();
});

test("under 360px the middle segments collapse to a … button that names the whole path, and expands on click", async () => {
  stubViewport(true);
  const user = userEvent.setup();
  const { container } = render(<PathTrail segments={segments} />);

  expect(container.textContent).toBe("Garage › … › Red box");
  expect(screen.queryByText("Closet")).toBeNull();
  const more = screen.getByRole("button", { name: "Show the full path: Garage, Closet, Toolbox, Red box" });
  expect(more.getAttribute("aria-expanded")).toBe("false");

  await user.click(more);
  expect(container.textContent).toBe("Garage › Closet › Toolbox › Red box");
  expect(screen.queryByRole("button")).toBeNull();
});

test("a path with no middle segments never shows the … button, even when narrow", () => {
  stubViewport(true);
  const { container } = render(<PathTrail segments={segments.slice(0, 2)} />);
  expect(screen.queryByRole("button")).toBeNull();
  expect(container.textContent).toBe("Garage › Closet");
});

test("a collapsed linked path keeps its first and last segments as links", () => {
  stubViewport(true);
  render(<PathTrail segments={segments} linked />);
  const links = screen.getAllByRole("link");
  expect(links.map((link) => link.textContent)).toEqual(["Garage", "Red box"]);
});
