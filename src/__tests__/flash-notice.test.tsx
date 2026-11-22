import { afterEach, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlashNotice } from "@/components/flash-notice";
import { browseDeletedHref, deletedNotice, itemSavedHref, savedNotice, urlWithoutNotice } from "@/lib/flash-notice";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

test("the hrefs the edit form navigates to", () => {
  expect(itemSavedHref("abc")).toBe("/items/abc?saved=1");
  expect(browseDeletedHref("loc", "Spare keys & fob")).toBe("/browse/loc?deleted=Spare%20keys%20%26%20fob");
});

test("savedNotice reads the saved parameter", () => {
  expect(savedNotice({ saved: "1" })).toBe("Saved");
  expect(savedNotice({})).toBeNull();
});

test("deletedNotice names the item, ignores a blank name and caps a long one", () => {
  expect(deletedNotice({ deleted: "Passport" })).toBe("Deleted Passport");
  expect(deletedNotice({ deleted: ["Passport", "Other"] })).toBe("Deleted Passport");
  expect(deletedNotice({ deleted: "   " })).toBeNull();
  expect(deletedNotice({})).toBeNull();
  const long = deletedNotice({ deleted: "x".repeat(500) });
  expect(long?.length).toBe("Deleted ".length + 120 + 1);
});

test("urlWithoutNotice drops only the notice parameters, keeping the rest of the URL", () => {
  expect(urlWithoutNotice("https://x.test/items/a?saved=1")).toBe("/items/a");
  expect(urlWithoutNotice("https://x.test/browse/b?deleted=Pass&q=k#top")).toBe("/browse/b?q=k#top");
  expect(urlWithoutNotice("https://x.test/browse/b?q=k")).toBeNull();
});

test("shows the message in a live region and removes the parameter from the address bar", async () => {
  window.history.replaceState(null, "", "/items/a?saved=1");
  render(<FlashNotice message="Saved" />);

  // Starts empty, then fills in: the change is what a screen reader announces.
  expect(screen.getByRole("status").textContent).toBe("");
  expect(await screen.findByText("Saved")).toBe(screen.getByRole("status"));
  expect(window.location.pathname + window.location.search).toBe("/items/a");
});

test("with no message, the live region is empty and the URL is left alone", () => {
  window.history.replaceState(null, "", "/items/a?q=1");
  render(<FlashNotice message={null} />);

  expect(screen.getByRole("status").textContent).toBe("");
  expect(window.location.search).toBe("?q=1");
});
