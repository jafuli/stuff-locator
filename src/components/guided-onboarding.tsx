"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { StashForm } from "@/components/stash-form";
import { Button } from "@/components/ui/button";
import type { Location } from "@/lib/fixtures/types";
import { createClient } from "@/server/db/client";
import { textLinkClassName } from "@/components/ui/text-link";

export interface GuidedOnboardingProps {
  householdId: string;
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
  /** Placeholder for the place field — hints that a place can nest. */
  locationHint: string;
}

// Per the Design Journal's stated examples — three different location
// shapes (filed away, bulky, small-and-hidden), not three arbitrary items.
const ITEM_STEPS: readonly ItemStep[] = [
  {
    title: "Stash something filed away",
    description: "A passport, a birth certificate — anything tucked in a folder or drawer.",
    locationHint: "e.g. Office, then Cabinet…",
  },
  {
    title: "Stash something bulky",
    description: "A camping tent, a suitcase — anything stored somewhere out of the way.",
    locationHint: "e.g. Garage, then Shelf…",
  },
  {
    title: "Stash something small and easy to lose",
    description: "Spare keys, a charger — anything that tends to go missing.",
    locationHint: "e.g. Hallway, then Key hook…",
  },
];

const TOTAL_STEPS = ITEM_STEPS.length + 1; // + the closing invite step

// textLinkClassName is 44px tall: a small text link is an unreliable touch
// target on a phone, and this control sits next to the form's own inputs.
const SKIP_LINK_CLASSES = textLinkClassName({
  muted: true,
  className: "-mr-2 px-2 disabled:cursor-not-allowed disabled:opacity-60",
});

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
 * A brand-new household has zero places, so every step builds its place with
 * the same path picker as Stash: each new level becomes a dashed chip and
 * the whole path is saved with the item. After each stash this component
 * re-reads the household's places, so the next step offers (and matches
 * against) what the earlier steps created instead of proposing a duplicate.
 */
export function GuidedOnboarding({ householdId, locations }: GuidedOnboardingProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [stashedThisStep, setStashedThisStep] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  // The household's places. The `locations` prop is the snapshot from when
  // Home rendered; after each stash this is re-read so a place named in step
  // 1 is offered in step 2 (and an exact name resolves to it rather than
  // proposing a second one). Keyed by id, so a place can only appear once.
  const [knownLocations, setKnownLocations] = useState<Location[]>(() => [...locations]);

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

  async function refreshLocations() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("locations")
        .select("id, parent_id, name")
        .eq("household_id", householdId);
      if (error) {
        // Not fatal: the item is saved, and the database resolves a typed
        // name to the existing place anyway. The picker just won't suggest it.
        return;
      }
      const byId = new Map<string, Location>();
      for (const row of data) {
        byId.set(row.id, { id: row.id, parentId: row.parent_id, name: row.name });
      }
      setKnownLocations([...byId.values()]);
    } catch {
      // Same reasoning: a failed refresh must not turn a saved item into an error.
    }
  }

  function handleStashed() {
    setStashedThisStep(true);
    void refreshLocations();
  }

  function advance() {
    shouldFocusHeading.current = true;
    setStashedThisStep(false);
    setStep(step + 1);
  }

  const isInviteStep = step === ITEM_STEPS.length;

  return (
    <div className="flex flex-col gap-3 rounded-panel border border-hairline bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <p aria-live="polite" className="text-section-label text-muted">
          Step {step + 1} of {TOTAL_STEPS}
        </p>
        <button type="button" onClick={() => void finish("home")} disabled={isFinishing} className={SKIP_LINK_CLASSES}>
          Skip guided setup
        </button>
      </div>

      {finishError ? (
        <p role="alert" className="text-meta text-signal">
          Couldn&apos;t save your progress: {finishError} Try again.
        </p>
      ) : null}

      {isInviteStep ? (
        <>
          <div>
            <h2 ref={headingRef} tabIndex={-1} className="text-title text-ink outline-none">
              Invite your partner
            </h2>
            <p className="text-meta text-muted">Stuff Locator works best shared — invite them to your household.</p>
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
            <h2 ref={headingRef} tabIndex={-1} className="text-title text-ink outline-none">
              {ITEM_STEPS[step].title}
            </h2>
            <p className="text-meta text-muted">{ITEM_STEPS[step].description}</p>
          </div>
          <StashForm
            // Forces a fresh instance per step (rather than one instance
            // whose props silently change underneath it).
            key={step}
            locations={knownLocations}
            locationPlaceholder={ITEM_STEPS[step].locationHint}
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
