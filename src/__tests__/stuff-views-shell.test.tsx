import { beforeEach, expect, test, vi } from "vitest";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RegisterStuffView, StuffViewsShell, useStuffViews } from "@/components/stuff-views-shell";
import { STUFF_PATH } from "@/lib/routes";
import { ONBOARDING_HEADING, STUFF_HEADING } from "@/lib/stuff-heading";

const nav = vi.hoisted(() => ({ pathname: "/stuff", pendingHref: null as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

// A Link stand-in that knows its own href, so useLinkStatus can report
// "pending" for one chip only — the way Next does for the tapped link.
const LinkHref = createContext<string | null>(null);
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <LinkHref.Provider value={href}>
      <a href={href} {...rest}>
        {children}
      </a>
    </LinkHref.Provider>
  ),
  useLinkStatus: () => ({ pending: useContext(LinkHref) === nav.pendingHref }),
}));

beforeEach(() => {
  nav.pathname = STUFF_PATH;
  nav.pendingHref = null;
});

/** A stand-in page: registers its data and shows the query it's handed. */
function Page({ onIntent }: { onIntent?: () => void }) {
  const { query, registerIntent } = useStuffViews();
  useEffect(() => {
    registerIntent(onIntent ?? null);
  }, [registerIntent, onIntent]);
  return (
    <>
      <RegisterStuffView mode="list" />
      <p>Page content, query: “{query}”</p>
    </>
  );
}

test("one header for both views: heading, search, Stash and the chips, with the current view's chip selected", () => {
  const { rerender } = render(
    <StuffViewsShell>
      <Page />
    </StuffViewsShell>,
  );

  expect(screen.getByRole("heading", { level: 1, name: STUFF_HEADING })).toBeDefined();
  expect(screen.getByRole("link", { name: "Stash" }).getAttribute("href")).toBe("/items/new");
  expect(screen.getByRole("link", { name: "All" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "By place" }).hasAttribute("aria-current")).toBe(false);

  nav.pathname = "/browse";
  rerender(
    <StuffViewsShell>
      <Page />
    </StuffViewsShell>,
  );
  expect(screen.getByRole("link", { name: "By place" }).getAttribute("aria-current")).toBe("page");
  expect(screen.getByRole("link", { name: "All" }).hasAttribute("aria-current")).toBe(false);
});

test("until the page below has its data, the search field is disabled", () => {
  const { rerender } = render(
    <StuffViewsShell>
      <p>Loading skeleton</p>
    </StuffViewsShell>,
  );

  expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Search your stuff" }).disabled).toBe(true);

  rerender(
    <StuffViewsShell>
      <Page />
    </StuffViewsShell>,
  );
  expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Search your stuff" }).disabled).toBe(false);
});

test("onboarding asks its own question and drops search, Stash and the chips", () => {
  render(
    <StuffViewsShell>
      <RegisterStuffView mode="onboarding" />
    </StuffViewsShell>,
  );

  expect(screen.getByRole("heading", { level: 1, name: ONBOARDING_HEADING })).toBeDefined();
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.queryByRole("link", { name: "Stash" })).toBeNull();
  expect(screen.queryByRole("navigation", { name: "Stuff view" })).toBeNull();
});

test("a tapped chip waiting on the server selects itself and shows the list skeleton at once, with search disabled", () => {
  const { rerender } = render(
    <StuffViewsShell>
      <Page />
    </StuffViewsShell>,
  );
  expect(screen.getByText(/Page content/)).toBeDefined();

  // By place tapped on a slow connection: the route isn't here yet.
  nav.pendingHref = "/browse";
  rerender(
    <StuffViewsShell>
      <Page />
    </StuffViewsShell>,
  );

  expect(screen.getByRole("link", { name: "By place" }).getAttribute("aria-current")).toBe("page");
  expect(screen.queryByText(/Page content/)).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Loading…");
  expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Search your stuff" }).disabled).toBe(true);
  // The header itself never left: same heading, same chips.
  expect(screen.getByRole("heading", { level: 1, name: STUFF_HEADING })).toBeDefined();
  expect(screen.getByRole("link", { name: "All" })).toBeDefined();

  // The navigation lands.
  nav.pendingHref = null;
  nav.pathname = "/browse";
  rerender(
    <StuffViewsShell>
      <Page />
    </StuffViewsShell>,
  );
  expect(screen.getByText(/Page content/)).toBeDefined();
  expect(screen.getByRole<HTMLInputElement>("searchbox", { name: "Search your stuff" }).disabled).toBe(false);
});

test("focusing and typing hand the query to the page and signal search intent", async () => {
  const user = userEvent.setup();
  const onIntent = vi.fn();
  render(
    <StuffViewsShell>
      <Page onIntent={onIntent} />
    </StuffViewsShell>,
  );

  await user.click(screen.getByRole("searchbox", { name: "Search your stuff" }));
  expect(onIntent).toHaveBeenCalledTimes(1);

  await user.type(screen.getByRole("searchbox", { name: "Search your stuff" }), "tent");
  expect(onIntent).toHaveBeenCalledTimes(5);
  expect(screen.getByText("Page content, query: “tent”")).toBeDefined();
});

test("the query and the field itself survive switching between All and By place", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <StuffViewsShell>
      <Page />
    </StuffViewsShell>,
  );
  const field = screen.getByRole("searchbox", { name: "Search your stuff" });
  await user.type(field, "keys");

  nav.pathname = "/browse";
  rerender(
    <StuffViewsShell>
      <Page key="browse" />
    </StuffViewsShell>,
  );

  expect(screen.getByRole("searchbox", { name: "Search your stuff" })).toBe(field);
  expect((field as HTMLInputElement).value).toBe("keys");
  expect(screen.getByText("Page content, query: “keys”")).toBeDefined();
});
