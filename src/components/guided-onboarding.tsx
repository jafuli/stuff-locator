"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { StashForm } from "@/components/stash-form";
import { Button } from "@/components/ui/button";
import type { LocationOption } from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";
import { createClient } from "@/server/db/client";

export interface GuidedOnboardingProps {
  householdId: string;
  userId: string;
  /** Full-path options to feed each item step's real StashForm. */
  locationOptions: readonly LocationOption[];
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

const SKIP_LINK_CLASSES =
  "text-[10.5px] text-mid underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Guided onboarding — the "ends with inviting your partner... doubles as
 * the demo script" sequence CLAUDE.md describes, shown on Home instead of
 * the plain empty state for a household with zero items that hasn't
 * finished (or skipped) this sequence yet (see page.tsx's own read of
 * households.onboarding_completed_at).
 *
 * Each item step embeds the real StashForm unmodified — "using the
 * now-real Stash flow under the hood" is literal, not a lookalike. Its own
 * success panel (View item / Add another / Back to home) still renders as
 * normal underneath this component's own "Continue" control, which only
 * appears once `onStashed` fires; both are real, working escape hatches
 * out of the guided sequence, consistent with AC #2 ("the user must always
 * be able to reach the real, un-onboarded app").
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
export function GuidedOnboarding({ householdId, userId, locationOptions, locations }: GuidedOnboardingProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [stashedThisStep, setStashedThisStep] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Not awaited-through with its own error handling: a failed UPDATE here
  // just means onboarding shows again next visit, which is a re-askable
  // no-op, not a stuck state — no different in kind from any other
  // best-effort UI refresh.
  async function markOnboardingComplete(): Promise<void> {
    const supabase = createClient();
    await supabase
      .from("households")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", householdId);
  }

  async function completeOnboarding() {
    setIsFinishing(true);
    await markOnboardingComplete();
    // Home is a Server Component — router.refresh() re-runs its data reads
    // (onboarding_completed_at now set, items possibly updated too) so it
    // renders the real, un-onboarded view next.
    router.refresh();
  }

  // Clicking through to Invite IS completing the sequence, not a side
  // exit — the AC frames it as "the final onboarding action." Marking
  // complete here (not just navigating) matters for a real case: without
  // it, a household that invites and later deletes every item it added
  // during onboarding would see the whole sequence resurface, having
  // already genuinely finished it once.
  async function completeOnboardingAndInvite() {
    setIsFinishing(true);
    await markOnboardingComplete();
    router.push("/settings/invite");
  }

  function advance() {
    setStashedThisStep(false);
    if (step + 1 >= TOTAL_STEPS) {
      void completeOnboarding();
      return;
    }
    setStep(step + 1);
  }

  const isInviteStep = step === ITEM_STEPS.length;

  return (
    <div className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">
          Step {step + 1} of {TOTAL_STEPS}
        </p>
        <button type="button" onClick={() => void completeOnboarding()} disabled={isFinishing} className={SKIP_LINK_CLASSES}>
          Skip guided setup
        </button>
      </div>

      {isInviteStep ? (
        <>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">Invite your partner</h2>
            <p className="text-[12px] text-mid">Stuff Locator works best shared — invite them to your household.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="primary" isLoading={isFinishing} onClick={() => void completeOnboardingAndInvite()}>
              Invite your partner
            </Button>
            <Button type="button" variant="secondary" isLoading={isFinishing} onClick={() => void completeOnboarding()}>
              {isFinishing ? "Finishing…" : "Finish without inviting"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <h2 className="text-[15px] font-semibold text-ink">{ITEM_STEPS[step].title}</h2>
            <p className="text-[12px] text-mid">{ITEM_STEPS[step].description}</p>
          </div>
          <StashForm
            // Forces a fresh instance per step (rather than one instance
            // whose props silently change underneath it) — a genuinely
            // fresh household has no locations at all yet, so
            // allowNewLocation is what makes each item step usable in the
            // first place, not just a convenience.
            key={step}
            householdId={householdId}
            userId={userId}
            locationOptions={locationOptions}
            locations={locations}
            allowNewLocation
            onStashed={() => {
              setStashedThisStep(true);
            }}
          />
          <Button type="button" variant={stashedThisStep ? "primary" : "secondary"} onClick={advance}>
            {stashedThisStep ? "Continue" : "Skip this step"}
          </Button>
        </>
      )}
    </div>
  );
}
