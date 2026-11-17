import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "@testing-library/react";

const { onAuthStateChange, unsubscribe } = vi.hoisted(() => {
  const unsubscribe = vi.fn();
  return {
    unsubscribe,
    onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe } } }),
  };
});
vi.mock("@/server/db/client", () => ({ createClient: () => ({ auth: { onAuthStateChange } }) }));

const { clearPrivateCaches } = vi.hoisted(() => ({ clearPrivateCaches: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/offline/clear-private-caches", () => ({ clearPrivateCaches }));

import { PrivateCacheGuard } from "@/components/private-cache-guard";

type Listener = (event: string, session: { user: { id: string } } | null) => void;

function mount(): Listener {
  render(<PrivateCacheGuard />);
  const listener = onAuthStateChange.mock.calls[0]?.[0] as Listener | undefined;
  if (!listener) {
    throw new Error("PrivateCacheGuard did not subscribe to auth changes");
  }
  return listener;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  onAuthStateChange.mockClear();
  clearPrivateCaches.mockClear();
  vi.restoreAllMocks();
});

test("signing out (from anywhere) clears", () => {
  window.localStorage.setItem("stuff-locator:last-user-id", "user-a");
  const emit = mount();

  emit("SIGNED_OUT", null);

  expect(clearPrivateCaches).toHaveBeenCalledTimes(1);
  expect(window.localStorage.getItem("stuff-locator:last-user-id")).toBeNull();
});

test("routine events for the same user keep the caches", () => {
  window.localStorage.setItem("stuff-locator:last-user-id", "user-a");
  const emit = mount();

  emit("INITIAL_SESSION", { user: { id: "user-a" } });
  emit("TOKEN_REFRESHED", { user: { id: "user-a" } });
  emit("SIGNED_IN", { user: { id: "user-a" } });

  expect(clearPrivateCaches).not.toHaveBeenCalled();
});

test("a different user signing in on this device clears", () => {
  window.localStorage.setItem("stuff-locator:last-user-id", "user-a");
  const emit = mount();

  emit("SIGNED_IN", { user: { id: "user-b" } });

  expect(clearPrivateCaches).toHaveBeenCalledTimes(1);
  expect(window.localStorage.getItem("stuff-locator:last-user-id")).toBe("user-b");
});

test("blocked storage still clears rather than throwing", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("SecurityError");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("SecurityError");
  });
  const emit = mount();

  expect(() => {
    emit("SIGNED_IN", { user: { id: "user-a" } });
  }).not.toThrow();
  expect(clearPrivateCaches).toHaveBeenCalledTimes(1);
});

test("unsubscribes on unmount", () => {
  const { unmount } = render(<PrivateCacheGuard />);
  unmount();
  expect(unsubscribe).toHaveBeenCalled();
});
