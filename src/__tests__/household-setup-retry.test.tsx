import { afterEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const { triggerHouseholdBootstrap } = vi.hoisted(() => ({ triggerHouseholdBootstrap: vi.fn() }));
vi.mock("@/lib/household-bootstrap-client", () => ({ triggerHouseholdBootstrap }));

import { HouseholdSetupRetry } from "@/components/household-setup-retry";

afterEach(() => {
  refresh.mockReset();
  triggerHouseholdBootstrap.mockReset();
});

test("says what happened in a real heading, and writes nothing until asked", () => {
  render(<HouseholdSetupRetry />);
  expect(screen.getByRole("heading", { level: 1, name: "Your household isn't set up yet" })).toBeDefined();
  expect(triggerHouseholdBootstrap).not.toHaveBeenCalled();
  expect(screen.queryByRole("alert")).toBeNull();
});

test("Try again re-runs the bootstrap and refreshes on success", async () => {
  triggerHouseholdBootstrap.mockResolvedValue(true);
  render(<HouseholdSetupRetry />);

  await userEvent.click(screen.getByRole("button", { name: "Try again" }));

  await waitFor(() => {
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  expect(triggerHouseholdBootstrap).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a failed retry shows an alert, doesn't refresh, and can be tried again", async () => {
  triggerHouseholdBootstrap.mockResolvedValue(false);
  render(<HouseholdSetupRetry />);

  await userEvent.click(screen.getByRole("button", { name: "Try again" }));

  expect((await screen.findByRole("alert")).textContent).toMatch(/didn.t work either/);
  expect(refresh).not.toHaveBeenCalled();

  const button = screen.getByRole("button", { name: "Try again" });
  expect(button.hasAttribute("disabled")).toBe(false);

  triggerHouseholdBootstrap.mockResolvedValue(true);
  await userEvent.click(button);
  await waitFor(() => {
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  expect(screen.queryByRole("alert")).toBeNull();
});

test("the button is busy while the bootstrap request is in flight", async () => {
  let resolve: (ok: boolean) => void = () => undefined;
  triggerHouseholdBootstrap.mockReturnValue(
    new Promise<boolean>((r) => {
      resolve = r;
    }),
  );
  render(<HouseholdSetupRetry />);

  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(screen.getByRole("button", { name: "Try again" }).hasAttribute("disabled")).toBe(true);

  resolve(false);
  await screen.findByRole("alert");
  expect(screen.getByRole("button", { name: "Try again" }).hasAttribute("disabled")).toBe(false);
});
