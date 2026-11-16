import { test, expect, type Page } from "@playwright/test";

// Focus rings used to compute to `outline-style: none` everywhere (see the
// focus-ring utility in globals.css). Unit tests can't see computed styles,
// so this asserts the ring a keyboard user actually gets: an input, a
// primary button and a text link, in both themes. Signed out, so it needs
// no account: /sign-in has all three.
async function focusedOutline(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) {
      return null;
    }
    const style = getComputedStyle(el);
    return { style: style.outlineStyle, width: style.outlineWidth, offset: style.outlineOffset };
  });
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`keyboard focus draws a 2px ring on inputs, buttons and links (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/sign-in");

    const targets = [
      page.getByLabel("Email"),
      page.getByRole("link", { name: "Forgot your password?" }),
      page.getByRole("button", { name: "Sign in" }),
    ];
    for (const target of targets) {
      // Tab until the target is focused, so :focus-visible applies the way it
      // does for a keyboard user (a programmatic .focus() may not).
      for (let i = 0; i < 10 && !(await target.evaluate((el) => el === document.activeElement)); i++) {
        await page.keyboard.press("Tab");
      }
      await expect(target).toBeFocused();
      expect(await focusedOutline(page)).toEqual({ style: "solid", width: "2px", offset: "2px" });
    }
  });
}
