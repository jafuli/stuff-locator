import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import Loading from "@/app/items/[id]/edit/loading";

test("renders an accessible, edit-form-scoped loading state", () => {
  render(<Loading />);
  const region = screen.getByText("Loading the edit-item form…").closest("main");
  expect(region?.getAttribute("aria-busy")).toBe("true");
  // Guards against an ancestor loading.tsx's copy leaking in here.
  expect(screen.queryByText("Loading this item…")).toBeNull();
});
