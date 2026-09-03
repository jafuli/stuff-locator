import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const { usePathname } = vi.hoisted(() => ({ usePathname: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname }));

// Static import is safe here: vi.mock calls are hoisted above imports, so
// next/navigation is already mocked by the time site-nav.tsx evaluates it.
import { SiteNav } from "@/components/site-nav";

test("marks the Stuff tab active on /", () => {
  usePathname.mockReturnValue("/");
  render(<SiteNav />);
  expect(screen.getByRole("link", { name: "Stuff" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBeNull();
});

test("marks the Activity tab active on /activity", () => {
  usePathname.mockReturnValue("/activity");
  render(<SiteNav />);
  expect(screen.getByRole("link", { name: "Activity" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "Stuff" }).getAttribute("aria-current")).toBeNull();
});
