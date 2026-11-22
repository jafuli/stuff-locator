"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { PathTrail } from "@/components/path-trail";
import { LocationPathPicker } from "@/components/location-path-picker";
import { Button, buttonClassName } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import type { LocationBreadcrumbSegment } from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";
import { resolvePath, type PathChip } from "@/lib/location-path-picker";
import { validateItemName, validateLocationPath } from "@/lib/stash-validation";
import { createClient } from "@/server/db/client";
import { useItemFieldErrors } from "@/components/use-item-field-errors";
import { textLinkClassName } from "@/components/ui/text-link";
import { STUFF_PATH } from "@/lib/routes";

export interface StashFormProps {
  /** Every place in the household — the picker searches and descends through these. */
  locations: readonly Location[];
  /**
   * Fires once, right after a real stash succeeds — in addition to, not
   * instead of, this form's own success panel below. Optional: only
   * GuidedOnboarding uses it, to know when to reveal its own "Continue"
   * control and to refresh its list of places (the `locations` prop is a
   * snapshot and doesn't know about places this stash just created).
   */
  onStashed?: (result: StashResult) => void;
  /**
   * When true, the success panel is a plain confirmation with no
   * navigation of its own (no "View item" / "Add another" / "Back to
   * home"). For hosts like GuidedOnboarding that supply the next action
   * themselves — otherwise the user sees two competing sets of buttons and
   * can wander out of the guided flow by accident.
   */
  embedded?: boolean;
  /** Placeholder for the empty place field, e.g. "Office, then Cabinet…". */
  locationPlaceholder?: string;
}

export interface StashResult {
  itemId: string;
  /** The place the item landed in (possibly just created). */
  locationId: string;
}

interface CapturedStash {
  id: string;
  name: string;
  segments: LocationBreadcrumbSegment[];
  detail?: string;
}

const LOCATION_ERROR_ID = "stash-location-error";

/** On the onboarding confirmation: where fixing a mistake happens. */
export const EMBEDDED_EDIT_HINT = "Open the item from the Stuff list to edit or delete it.";

/**
 * Add-item form, backed by a real Supabase write: submit calls the
 * `stash_item` RPC, which creates any missing places and the item in ONE
 * transaction. Two separate calls (insert the places, then the item) are what
 * produced duplicate places: a retry after a failed item insert created the
 * places again. A place outside the caller's household is rejected by the
 * function's own membership check — this component adds no redundant check
 * of its own.
 *
 * The place is built in LocationPathPicker as a chip path (ADR 0010); dashed
 * chips are written only here, with the item.
 *
 * After a save, focus moves to the confirmation (it would otherwise fall to
 * <body> with the unmounted form), and an always-mounted live region says
 * "Added <name>": a region that arrives already holding its text is often
 * not read out.
 *
 * Embedded (onboarding), the confirmation has no actions of its own, only a
 * hint that the item can be edited or deleted from the Stuff list.
 */
export function StashForm({ locations, onStashed, embedded = false, locationPlaceholder }: StashFormProps) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [chips, setChips] = useState<PathChip[]>([]);
  const [pendingText, setPendingText] = useState("");
  const { fieldErrors, report, clear, reset, nameRef: nameInputRef, locationRef } = useItemFieldErrors();
  const [captured, setCaptured] = useState<CapturedStash | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const confirmationLabelId = useId();
  const confirmationRef = useRef<HTMLDivElement>(null);
  // Focus moves to the confirmation when a save puts it on screen, never on
  // first render.
  useEffect(() => {
    if (captured) {
      confirmationRef.current?.focus();
    }
  }, [captured]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // On a failure, focus moves to the first invalid field.
    const hasErrors = report({
      name: validateItemName(name),
      location: validateLocationPath(chips, pendingText),
    });
    const path = resolvePath(chips);
    if (hasErrors || path === null) {
      return;
    }

    const trimmedDetail = detail.trim();

    setSubmitError(null);
    setIsSubmitting(true);

    const supabase = createClient();

    // Optional arguments are left out rather than sent as null.
    const { data, error } = await supabase.rpc("stash_item", {
      p_name: name.trim(),
      ...(trimmedDetail === "" ? {} : { p_detail: trimmedDetail }),
      ...(path.locationId === null ? {} : { p_location_id: path.locationId }),
      ...(path.newPath.length === 0 ? {} : { p_new_path: path.newPath }),
    });

    setIsSubmitting(false);

    if (error) {
      // Surfaced verbatim (matches sign-in-form.tsx's precedent for
      // Supabase-originated messages) — field values are left exactly as
      // typed so the user can just hit submit again, not re-enter anything.
      setSubmitError(error.message);
      return;
    }

    // The chips are the path the person built, so they name every level —
    // including places this save just created, which `locations` can't know.
    // Only the last level's id is known (it is the item's location).
    const segments = chips.map((chip, index) => ({
      id: index === chips.length - 1 ? data.location_id : chip.kind === "existing" ? chip.id : `new-${String(index)}`,
      name: chip.name,
    }));

    setCaptured({
      id: data.id,
      name: data.name,
      segments,
      detail: data.detail ?? undefined,
    });
    setAnnouncement(`Added ${data.name}`);
    onStashed?.({ itemId: data.id, locationId: data.location_id });
  }

  // A field's error clears as soon as that field changes, rather than
  // waiting for the next submit: a stale "Choose a location…" next to a
  // fresh "Goes in …" hint contradicts it.
  function handleNameChange(next: string) {
    setName(next);
    clear("name");
  }

  function handleChipsChange(next: PathChip[]) {
    setChips(next);
    clear("location");
  }

  function handlePendingTextChange(next: string) {
    setPendingText(next);
    clear("location");
  }

  function handleAddAnother() {
    setName("");
    setDetail("");
    setChips([]);
    setPendingText("");
    reset();
    setAnnouncement("");
    setCaptured(null);
  }

  function renderBody() {
    if (captured && embedded) {
      return (
        <div
          ref={confirmationRef}
          role="group"
          aria-labelledby={confirmationLabelId}
          tabIndex={-1}
          className="flex flex-col gap-2 rounded-panel border border-hairline bg-surface p-4 outline-none"
        >
          <p id={confirmationLabelId} className="text-section-label text-muted">
            Added
          </p>
          <p className="text-title text-ink">{captured.name}</p>
          <PathTrail segments={captured.segments} printIn />
          {captured.detail ? <p className="text-meta text-muted">{captured.detail}</p> : null}
          <p className="text-meta text-muted">{EMBEDDED_EDIT_HINT}</p>
        </div>
      );
    }

    if (captured) {
      return (
        <div
          ref={confirmationRef}
          role="group"
          aria-labelledby={confirmationLabelId}
          tabIndex={-1}
          className="flex flex-col gap-3 rounded-panel border border-hairline bg-surface p-4 outline-none"
        >
          <div>
            <p id={confirmationLabelId} className="text-section-label text-muted">
              Added
            </p>
            <p className="text-title text-ink">{captured.name}</p>
          </div>
          <PathTrail segments={captured.segments} printIn />
          {captured.detail ? <p className="text-meta text-muted">{captured.detail}</p> : null}
          <p className="text-meta text-muted">Saved. It shows up on Home and in Browse right away.</p>
          <div className="flex flex-wrap gap-2">
            <Link href={`/items/${captured.id}`} className={buttonClassName("primary")}>
              View item
            </Link>
            <Button type="button" variant="secondary" onClick={handleAddAnother}>
              Add another
            </Button>
            <Link href={STUFF_PATH} className={textLinkClassName()}>
              Back to home
            </Link>
          </div>
        </div>
      );
    }

    return (
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <FormField
          ref={nameInputRef}
          id="stash-name"
          label="Name"
          type="text"
          value={name}
          onChange={handleNameChange}
          error={fieldErrors.name}
          // An item's name, not the person's: no browser autofill.
          autoComplete="off"
          disabled={isSubmitting}
        />

        <div>
          <LocationPathPicker
            label="Location"
            locations={locations}
            value={chips}
            onChange={handleChipsChange}
            onInputChange={handlePendingTextChange}
            inputRef={locationRef}
            placeholder={locationPlaceholder}
            describedBy={fieldErrors.location ? LOCATION_ERROR_ID : undefined}
            disabled={isSubmitting}
          />
          {fieldErrors.location ? (
            <p id={LOCATION_ERROR_ID} role="alert" className="mt-1 text-meta text-signal">
              {fieldErrors.location}
            </p>
          ) : null}
        </div>

        <FormField
          id="stash-detail"
          label="Detail (optional)"
          type="text"
          value={detail}
          onChange={setDetail}
          disabled={isSubmitting}
        />

        {submitError ? (
          <p role="alert" className="text-meta text-signal">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {isSubmitting ? "Adding…" : "Add item"}
        </Button>
      </form>
    );
  }

  return (
    <>
      {renderBody()}
      {/* Always mounted, so filling it in is announced. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
