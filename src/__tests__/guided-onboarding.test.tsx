import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Location } from "@/lib/fixtures/types";

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

// GuidedOnboarding writes to `households`; the item steps' embedded
// StashForm writes to `items` — both go through this same mocked module,
// same shortcut stash-form.test.tsx already established, extended here to
// dispatch on the table name since this component touches two.
const { insertSingle, updateEq, updateSelect } = vi.hoisted(() => ({
  insertSingle: vi.fn(),
  updateEq: vi.fn(),
  updateSelect: vi.fn(),
}));
vi.mock("@/server/db/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "households") {
        // update(...).eq(...).select("id") — the select is how the component
        // tells "updated" from "RLS filtered it to nothing".
        return {
          update: () => ({
            eq: (...args: unknown[]) => {
              updateEq(...args);
              return { select: updateSelect };
            },
          }),
        };
      }
      return { insert: () => ({ select: () => ({ single: insertSingle }) }) };
    },
  }),
}));

import { GuidedOnboarding } from "@/components/guided-onboarding";

const LOCATIONS: Location[] = [
  { id: "garage", parentId: null, name: "Garage" },
  { id: "garage-closet", parentId: "garage", name: "Closet" },
];
const HOUSEHOLD_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  updateSelect.mockResolvedValue({ data: [{ id: HOUSEHOLD_ID }], error: null });
});

afterEach(() => {
  push.mockReset();
  refresh.mockReset();
  insertSingle.mockReset();
  updateEq.mockReset();
  updateSelect.mockReset();
});

function renderOnboarding() {
  return render(<GuidedOnboarding householdId={HOUSEHOLD_ID} userId={USER_ID} locations={LOCATIONS} />);
}

test("shows the first item step by default, with the real Stash form embedded", () => {
  renderOnboarding();

  expect(screen.getByText("Step 1 of 4")).toBeDefined();
  expect(screen.getByRole("heading", { name: "Stash something filed away" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Add item" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Skip this step" })).toBeDefined();
});

test("skipping a step advances to the next one without writing anything", async () => {
  const user = userEvent.setup();
  renderOnboarding();

  await user.click(screen.getByRole("button", { name: "Skip this step" }));

  expect(screen.getByText("Step 2 of 4")).toBeDefined();
  expect(screen.getByRole("heading", { name: "Stash something bulky" })).toBeDefined();
  expect(insertSingle).not.toHaveBeenCalled();
  expect(updateEq).not.toHaveBeenCalled();
});

test("a real stash reveals Continue; clicking it advances without completing onboarding yet", async () => {
  insertSingle.mockResolvedValueOnce({
    data: { id: "33333333-3333-3333-3333-333333333333", name: "Passport", detail: null },
    error: null,
  });

  const user = userEvent.setup();
  renderOnboarding();

  await user.type(screen.getByLabelText("Name"), "Passport");
  await user.type(screen.getByRole("combobox"), "Closet");
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));

  const continueButton = await screen.findByRole("button", { name: "Continue" });
  await user.click(continueButton);

  expect(screen.getByText("Step 2 of 4")).toBeDefined();
  expect(updateEq).not.toHaveBeenCalled();
});

test("'Skip guided setup' completes onboarding immediately from any step", async () => {
  const user = userEvent.setup();
  renderOnboarding();

  await user.click(screen.getByRole("button", { name: "Skip guided setup" }));

  expect(updateEq).toHaveBeenCalledWith("id", HOUSEHOLD_ID);
  expect(refresh).toHaveBeenCalled();
});

test("skipping every item step reaches the invite step, with a real link and a finish control", async () => {
  const user = userEvent.setup();
  renderOnboarding();

  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Skip this step" }));

  expect(screen.getByText("Step 4 of 4")).toBeDefined();
  expect(screen.getByRole("heading", { name: "Invite your partner" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Invite your partner" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Finish without inviting" })).toBeDefined();
});

test("finishing on the invite step persists onboarding_completed_at and refreshes Home", async () => {
  const user = userEvent.setup();
  renderOnboarding();

  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Finish without inviting" }));

  expect(updateEq).toHaveBeenCalledWith("id", HOUSEHOLD_ID);
  expect(refresh).toHaveBeenCalled();
});

test("clicking 'Invite your partner' also persists onboarding_completed_at, then navigates to /settings/invite", async () => {
  const user = userEvent.setup();
  renderOnboarding();

  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Invite your partner" }));

  expect(updateEq).toHaveBeenCalledWith("id", HOUSEHOLD_ID);
  expect(push).toHaveBeenCalledWith("/settings/invite");
});

async function stash(user: ReturnType<typeof userEvent.setup>, name: string, location: string) {
  await user.type(screen.getByLabelText("Name"), name);
  await user.type(screen.getByRole("combobox"), location);
  await user.keyboard("{ArrowDown}{Enter}");
  await user.click(screen.getByRole("button", { name: "Add item" }));
}

test("a stash shows a plain confirmation with only Continue — no competing View item / Add another / Back to home", async () => {
  insertSingle.mockResolvedValueOnce({
    data: { id: "33333333-3333-3333-3333-333333333333", name: "Passport", detail: null },
    error: null,
  });
  const user = userEvent.setup();
  renderOnboarding();

  await stash(user, "Passport", "Closet");

  await screen.findByRole("button", { name: "Continue" });
  expect(screen.getByRole("status").textContent).toContain("Passport");
  expect(screen.queryByRole("link", { name: "View item" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Back to home" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add another" })).toBeNull();
});

test("a place created in one step is offered as an existing place in the next step", async () => {
  insertSingle
    .mockResolvedValueOnce({ data: { id: "loc-attic", name: "Attic", parent_id: null }, error: null })
    .mockResolvedValueOnce({
      data: { id: "33333333-3333-3333-3333-333333333333", name: "Passport", detail: null },
      error: null,
    });
  const user = userEvent.setup();
  renderOnboarding();

  await stash(user, "Passport", "Attic");
  await user.click(await screen.findByRole("button", { name: "Continue" }));

  await user.type(screen.getByRole("combobox"), "Attic");
  // Without the shared list this option would be missing and only the
  // "+ New place called…" row would appear, so the user would create a
  // second "Attic".
  expect(screen.getByRole("option", { name: "Attic" })).toBeDefined();
});

test("advancing moves focus to the new step's heading; the first render does not steal focus", async () => {
  const user = userEvent.setup();
  renderOnboarding();
  expect(document.body).toBe(document.activeElement);

  await user.click(screen.getByRole("button", { name: "Skip this step" }));

  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Stash something bulky" }));
});

test("the step label is a polite live region", () => {
  renderOnboarding();
  expect(screen.getByText("Step 1 of 4").getAttribute("aria-live")).toBe("polite");
});

test("when saving onboarding_completed_at fails, the error is shown, nothing navigates, and retrying works", async () => {
  updateSelect.mockResolvedValueOnce({ data: null, error: { message: "network down" } });
  const user = userEvent.setup();
  renderOnboarding();

  await user.click(screen.getByRole("button", { name: "Skip guided setup" }));

  expect((await screen.findByRole("alert")).textContent).toContain("network down");
  expect(refresh).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Skip guided setup" }).hasAttribute("disabled")).toBe(false);

  await user.click(screen.getByRole("button", { name: "Skip guided setup" }));

  expect(refresh).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("an update that touches no row (RLS filtered it) is reported, not treated as success", async () => {
  updateSelect.mockResolvedValueOnce({ data: [], error: null });
  const user = userEvent.setup();
  renderOnboarding();

  await user.click(screen.getByRole("button", { name: "Skip guided setup" }));

  expect(await screen.findByRole("alert")).toBeDefined();
  expect(refresh).not.toHaveBeenCalled();
});

test("a failed save on the invite step does not navigate to /settings/invite", async () => {
  updateSelect.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
  const user = userEvent.setup();
  renderOnboarding();

  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Skip this step" }));
  await user.click(screen.getByRole("button", { name: "Invite your partner" }));

  expect(await screen.findByRole("alert")).toBeDefined();
  expect(push).not.toHaveBeenCalled();
});
