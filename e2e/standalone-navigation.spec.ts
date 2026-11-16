import { test, expect, type Page } from "@playwright/test";

// The signed-out pages (marketing home, sign in, sign up, forgot password)
// share one header and must move between each other in a single step.

for (const path of ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"]) {
  test(`${path}: the wordmark links back to the marketing home`, async ({ page }) => {
    await page.goto(path);
    await page.getByRole("banner").getByRole("link", { name: "Stuff Locator" }).click();
    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Where did we put the passports?" })).toBeVisible();
  });
}

/**
 * Records every h1 that appears from now on. The root loading.tsx used to
 * be the Stuff screen's skeleton, and it flashed "What are you looking
 * for?" between these pages for a few hundred milliseconds.
 */
async function recordHeadings(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { __headings: string[] }).__headings = seen;
    new MutationObserver(() => {
      for (const h1 of document.querySelectorAll("h1")) {
        const text = h1.textContent;
        if (seen.at(-1) !== text) {
          seen.push(text);
        }
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  return () => page.evaluate(() => (window as unknown as { __headings: string[] }).__headings);
}

const NAVIGATIONS = [
  { from: "/sign-in", link: "Sign up", to: "Create your account" },
  { from: "/sign-up", link: "Sign in", to: "Sign in" },
  { from: "/", link: "Sign in", to: "Sign in" },
  { from: "/", link: "Sign up", to: "Create your account" },
  { from: "/sign-in", link: "Stuff Locator", to: "Where did we put the passports?" },
];

for (const nav of NAVIGATIONS) {
  test(`${nav.from} → ${nav.link} goes straight to "${nav.to}", with no skeleton in between`, async ({ page }) => {
    await page.goto(nav.from);
    const headings = await recordHeadings(page);
    await page.getByRole("link", { name: nav.link, exact: true }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: nav.to })).toBeVisible();
    expect(await headings()).not.toContain("What are you looking for?");
  });
}
