import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Loading from "@/app/items/[id]/loading";

test("renders an accessible, item-detail-scoped loading state", () => {
  render(<Loading />);
  const region = screen.getByText("Loading this item…").closest("main");
  expect(region?.getAttribute("aria-busy")).toBe("true");
  // Guards against the root loading.tsx's home-page copy leaking in here.
  expect(screen.queryByText("Our stuff")).toBeNull();
});
