import type { Page } from "@playwright/test";

/**
 * Tabs forward from the top of the document until an element with the given
 * accessible name is focused, or gives up after `max` presses. Used instead
 * of `.focus()` (which sets focus programmatically regardless of tab order)
 * to prove the element is actually reachable by keyboard.
 */
export async function tabUntilFocused(page: Page, name: string, max = 25): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const focusedName = await page.evaluate((): string => {
      const el = document.activeElement;
      if (!el) {
        return "";
      }
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel !== null) {
        return ariaLabel;
      }
      // Element.textContent (unlike the broader Node.textContent) is never
      // null per spec — TS's DOM lib narrows it accordingly, so no null
      // check here.
      return el.textContent.trim();
    });
    if (focusedName === name) {
      return true;
    }
  }
  return false;
}

/**
 * Same idea as tabUntilFocused, but matches by `href` instead of accessible
 * name — needed for links like ItemCard's, whose accessible name is the
 * concatenation of several child elements (name, breadcrumb, detail,
 * relative-time badge), not a single clean label to match against.
 */
export async function tabUntilHrefFocused(page: Page, href: string, max = 25): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const focusedHref = await page.evaluate(
      () => document.activeElement instanceof HTMLAnchorElement ? document.activeElement.getAttribute("href") : null,
    );
    if (focusedHref === href) {
      return true;
    }
  }
  return false;
}
