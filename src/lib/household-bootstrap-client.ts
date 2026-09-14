// How long SignUpForm/SignInForm keep the bootstrap-failure notice up
// before auto-navigating to "/" — see HouseholdBootstrapNotice's doc
// comment for why this is both self-clearing and dismissible.
export const BOOTSTRAP_NOTICE_AUTO_CONTINUE_MS = 2000;

/**
 * Best-effort household bootstrap: POSTs to the route handler that ensures
 * the signed-in user belongs to a household (creating one via
 * create_household if they don't already — see
 * src/server/services/household.ts). Never throws: a failure here must
 * not be able to trap the user on the auth page, so callers just get a
 * boolean back and decide what to show.
 *
 * Shared by SignUpForm and SignInForm rather than duplicated inline, since
 * both call it identically right before their existing router.push("/").
 */
export async function triggerHouseholdBootstrap(): Promise<boolean> {
  try {
    const response = await fetch("/api/household/bootstrap", { method: "POST" });
    if (!response.ok) {
      return false;
    }
    const payload = (await response.json()) as { ok?: boolean };
    return payload.ok === true;
  } catch {
    return false;
  }
}
