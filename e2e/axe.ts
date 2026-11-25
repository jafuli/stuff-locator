import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * The Label Maker design system ships a light and a dark palette that follow
 * the OS, so a contrast failure can live in just one of them. Every axe scan
 * in e2e/ goes through this helper so none of them can quietly check light
 * mode only.
 */
const COLOR_SCHEMES = ["light", "dark"] as const;

/**
 * Scans the page as it is now, once per colour scheme, and fails on any
 * critical or serious violation. The pass/fail threshold is impact-gated:
 * axe's "moderate" and "minor" findings are advisory here.
 *
 * `label` names the screen in the failure message when one test scans
 * several pages.
 *
 * Emulation is reset afterwards, so the rest of the test runs in the
 * browser's default scheme again.
 */
export async function expectNoSeriousAxeViolations(page: Page, label?: string): Promise<void> {
  for (const colorScheme of COLOR_SCHEMES) {
    // reducedMotion matters here: colours transition for 150ms, and axe would
    // otherwise sample a half-way blend right after the scheme flips.
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    // Two frames: lets the restyle (and the now-instant transitions) land.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );
    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrWorse = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );
    const where = label === undefined ? colorScheme : `${label}, ${colorScheme}`;
    expect(seriousOrWorse, `${where}: ${JSON.stringify(seriousOrWorse, null, 2)}`).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: null, reducedMotion: null });
}
