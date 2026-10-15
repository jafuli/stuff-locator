"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { StashForm, type StashResult } from "@/components/stash-form";
import { Button } from "@/components/ui/button";
import { getFullLocationPaths } from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";
import { createClient } from "@/server/db/client";

export interface GuidedOnboardingProps {
  householdId: string;
  userId: string;
  /**
   * The household's locations when Home rendered. Locations created by
   * earlier steps are tracked locally (see knownLocations) so later steps'
   * autocomplete offers them instead of proposing a duplicate.
   */
  locations: readonly Location[];
}

interface ItemStep {
  title: string;
  description: string;
}

// Per the Design Journal's stated examples — three different location
// shapes (filed away, bulky, small-and-hidden), not three arbitrary items.
const ITEM_STEPS: readonly ItemStep[] = [
  {
    title: "Stash something filed away",
    description: "A passport, a birth certificate — anything tucked in a folder or drawer.",
  },
  {
    title: "Stash something bulky",
    description: "A camping tent, a suitcase — anything stored somewhere out of the way.",
  },
  {
    title: "Stash something small and easy to lose",
    description: "Spare keys, a charger — anything that tends to go missing.",
  },
];

const TOTAL_STEPS = ITEM_STEPS.length + 1; // + the closing invite step

// min-h-[44px]: a 10.5px text link is an unreliable touch target on a phone,
// and this control sits next to the form's own inputs.
const SKIP_LINK_CLASSES =
  "-mr-2 inline-flex min-h-[44px] items-center px-2 text-[10.5px] text-mid underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Guided onboarding — the "ends with inviting your partner... doubles as
 * the demo script" sequence CLAUDE.md describes, shown on Home instead of
 * the plain empty state for a household with zero items that hasn't
 * finished (or skipped) this sequence yet (see page.tsx's own read of
 * households.onboarding_completed_at).
 *
 * Each item step embeds the real StashForm — "using the now-real Stash
 * flow under the hood" is literal, not a lookalike. It runs in `embedded`
 * mode, so its success panel is a plain confirmation and this component's
 * own "Continue" control (which appears once `onStashed` fires) is the one
 * next action; the way out of the guided sequence stays "Skip guided
 * setup", available on every step (AC #2: "the user must always be able to
 * reach the real, un-onboarded app").
 *
 * Between steps, focus moves to the new step's heading and the "Step N of
 * 4" label is a polite live region, so keyboard and screen-reader users
 * aren't left on a button that has just unmounted.
 *
 * Reaching the end of the sequence — by adding items, by skipping every
 * step, by inviting, or any mix — always marks
 * households.onboarding_completed_at once, so onboarding never resurfaces
 * for this household regardless of which path got there (AC #4) —
 * including "invite your partner" itself, not just the two skip controls;
 * see completeOnboardingAndInvite's own comment for why that one needed to
 * be a real action rather than a plain `<Link>`. A visible "Skip guided
 * setup" control is available on every step, not just a per-step skip, so
 * a user who wants out immediately never has to click through the
 * remaining steps one at a time.
 *
 * `allowNewLocation` on each step's StashForm is load-bearing, not a nice-
 * to-have: a genuinely brand-new household (this component's whole reason
 * to exist) has zero locations yet, and Stash's own AC deliberately
 * rejects picking "+ New place" everywhere else — without this, every item
 * step would be unsatisfiable for the exact household onboarding exists
 * for. Each new location is created top-level (no parent), matching
 * Add-location's own default and CLAUDE.md's "shallow by default" capture
 * guidance.
 */
export function GuidedOnboarding({ householdId, userId, locations }: GuidedOnboardingProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [stashedThisStep, setStashedThisStep] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  // Locations created by earlier steps. The `locations` prop is the snapshot
  // from when Home rendered; without this, a room named in step 1 would be
  // invisible to step 2's autocomplete, which would then offer to create a
  // second room with the same name.
  const [createdLocations, setCreatedLocations] = useState<Location[]>([]);
  const locationOptions = useMemo(
    () => getFullLocationPaths([...locations, ...createdLocations]),
    [locations, createdLocations],
  );
  const knownLocations = useMemo(() => [...locations, ...createdLocations], [locations, createdLocations]);

  const headingRef = useRef<HTMLHeadingElement>(null);
  // Set by advance(), consumed by the effect below — focus only moves in
  // response to the user advancing, never on first render (which would pull
  // focus off the page's own start) and never twice under Strict Mode.
  const shouldFocusHeading = useRef(false);
  useEffect(() => {
    if (shouldFocusHeading.current) {
      shouldFocusHeading.current = false;
      headingRef.current?.focus();
    }
  }, [step]);

  // Returns an error message, or null on success. Surfaced to the user
  // rather than swallowed: a silent failure here meant onboarding came
  // straight back on the next refresh with no explanation. The zero-row
  // check matters because RLS filters a disallowed UPDATE to nothing and
  // reports success.
  async function markOnboardingComplete(): Promise<string | null> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("households")
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq("id", householdId)
        .select("id");
      if (error) {
        return error.message;
      }
      if (data.length === 0) {
        return "Your household couldn't be updated.";
      }
      return null;
    } catch {
      return "Couldn't reach the server.";
    }
  }

  // Reaching the end by any route — skipping, finishing, or inviting —
  // marks the household done. Clicking through to Invite IS completing the
  // sequence, not a side exit: without marking it, a household that invites
  // and later deletes every item it added would see the whole sequence
  // resurface. On failure nothing navigates; the same control stays
  // available as the retry.
  async function finish(destination: "home" | "invite") {
    setIsFinishing(true);
    setFinishError(null);
    const message = await markOnboardingComplete();
    if (message) {
      setIsFinishing(false);
      setFinishError(message);
      return;
    }
    if (destination === "invite") {
      router.push("/settings/invite");
      return;
    }
    // Home is a Server Component — router.refresh() re-runs its data reads
    // (onboarding_completed_at now set, items possibly updated too) so it
    // renders the real, un-onboarded view next.
    router.refresh();
  }

  function handleStashed(result: StashResult) {
    setStashedThisStep(true);
    if (result.createdLocation) {
      const created = result.createdLocation;
      setCreatedLocations((previous) => [...previous, created]);
    }
  }

  function advance() {
    shouldFocusHeading.current = true;
    setStashedThisStep(false);
    setStep(step + 1);
  }

  const isInviteStep = step === ITEM_STEPS.length;

  return (
    <div className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <p aria-live="polite" className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">
          Step {step + 1} of {TOTAL_STEPS}
        </p>
        <button type="button" onClick={() => void finish("home")} disabled={isFinishing} className={SKIP_LINK_CLASSES}>
          Skip guided setup
        </button>
      </div>

      {finishError ? (
        <p role="alert" className="text-[11.5px] text-mid">
          Couldn&apos;t save your progress: {finishError} Try again.
        </p>
      ) : null}

      {isInviteStep ? (
        <>
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-[15px] font-semibold text-ink outline-none">
              Invite your partner
            </h2>
            <p className="text-[12px] text-mid">Stuff Locator works best shared — invite them to your household.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" isLoading={isFinishing} onClick={() => void finish("invite")}>
              Invite your partner
            </Button>
            <Button type="button" variant="secondary" isLoading={isFinishing} onClick={() => void finish("home")}>
              {isFinishing ? "Finishing…" : "Finish without inviting"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-[15px] font-semibold text-ink outline-none">
              {ITEM_STEPS[step].title}
            </h2>
            <p className="text-[12px] text-mid">{ITEM_STEPS[step].description}</p>
          </div>
          <StashForm
            // Forces a fresh instance per step (rather than one instance
            // whose props silently change underneath it).
            key={step}
            householdId={householdId}
            userId={userId}
            locationOptions={locationOptions}
            locations={knownLocations}
            allowNewLocation
            embedded
            onStashed={handleStashed}
          />
          <Button type="button" variant={stashedThisStep ? "primary" : "secondary"} onClick={advance}>
            {stashedThisStep ? "Continue" : "Skip this step"}
          </Button>
        </>
      )}
    </div>
  );
}
