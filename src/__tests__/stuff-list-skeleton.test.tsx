import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import StuffLoading from "@/app/(app)/(stuff-views)/stuff/loading";
import BrowseLoading from "@/app/(app)/(stuff-views)/browse/loading";

// Both views' loading states sit under the shared header (StuffViewsShell),
// which stays on screen. So they are the list area only, and the same one:
// no heading, no search field, no chips of their own to flash in and out.
for (const [name, Loading] of [
  ["Stuff", StuffLoading],
  ["Browse", BrowseLoading],
] as const) {
  test(`the ${name} loading state is only the list skeleton, announced as busy`, () => {
    const { container } = render(<Loading />);

    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Loading…");
  });
}
