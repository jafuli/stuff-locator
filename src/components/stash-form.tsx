"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { LocationAutocomplete, type AutocompleteSelection } from "@/components/location-autocomplete";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import {
  getBreadcrumbSegments,
  type LocationBreadcrumbSegment,
  type LocationOption,
} from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";
import { validateItemName, validateLocationSelection } from "@/lib/stash-validation";
import { createClient } from "@/server/db/client";

export interface StashFormProps {
  /** Full-path options to feed LocationAutocomplete. */
  locationOptions: readonly LocationOption[];
  /** Raw location tree, needed to resolve a selected id into breadcrumb segments for the success state. */
  locations: readonly Location[];
  /**
   * Fires once, right after a real insert succeeds — in addition to, not
   * instead of, this form's own success panel below. Optional: only
   * GuidedOnboarding uses it, to know when to reveal its own "Continue"
   * control; every other caller leaves this unset and is unaffected.
   *
   * Reports the place a typed "+ New place" name resolved to, so a caller that
   * keeps its own copy of the location list (GuidedOnboarding) can add it —
   * the `locations`/`locationOptions` props are a snapshot and don't know
   * about it. It may be a place this stash just created or an existing
   * top-level place with the same name (names are unique per parent, ignoring
   * case), so callers must de-duplicate by id.
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
  /**
   * When true, picking the autocomplete's "+ New place called…" row is
   * accepted instead of rejected: the typed name is sent to `stash_item` as
   * a one-level top-level path, which finds a place of that name (any case)
   * or creates it, in the same transaction as the item. Off by default,
   * preserving this form's existing behavior everywhere else: Stash's own
   * task deliberately scoped inline location creation out ("adding a new
   * one isn't supported here yet"). GuidedOnboarding turns this on because
   * a genuinely brand-new household has zero existing locations to pick
   * from at all — without this, its item steps could never succeed.
   */
  allowNewLocation?: boolean;
}

export interface StashResult {
  itemId: string;
  /** Set only when a typed new place was submitted: the top-level place it resolved to. */
  createdLocation?: Location;
}

interface FieldErrors {
  name?: string;
  location?: string;
}

interface CapturedStash {
  id: string;
  name: string;
  segments: LocationBreadcrumbSegment[];
  detail?: string;
}

const LOCATION_ERROR_ID = "stash-location-error";

/**
 * Add-item form, backed by a real Supabase write: submit calls the
 * `stash_item` RPC, which creates any missing place and the item in ONE
 * transaction. Two separate calls (insert the place, then the item) are what
 * produced duplicate places: a retry after a failed item insert created the
 * place again. A location outside the caller's household is rejected by the
 * function's own membership check — this component adds no redundant check
 * of its own.
 */
export function StashForm({
  locationOptions,
  locations,
  onStashed,
  embedded = false,
  allowNewLocation = false,
}: StashFormProps) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [locationSelection, setLocationSelection] = useState<AutocompleteSelection | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [captured, setCaptured] = useState<CapturedStash | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const locationError = allowNewLocation
      ? locationSelection === null
        ? "Choose a location for this item."
        : undefined
      : validateLocationSelection(locationSelection);
    const errors: FieldErrors = {
      name: validateItemName(name),
      location: locationError,
    };
    setFieldErrors(errors);

    if (errors.name || errors.location || locationSelection === null) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedDetail = detail.trim();

    setSubmitError(null);
    setIsSubmitting(true);

    const supabase = createClient();

    // An existing place is passed by id. A typed new place is passed as a
    // one-level path and resolved by the function: it reuses a top-level
    // place of that name (any case) or creates it, in the same transaction
    // as the item. Optional arguments are left out rather than sent as null.
    const { data, error } = await supabase.rpc("stash_item", {
      p_name: trimmedName,
      ...(trimmedDetail === "" ? {} : { p_detail: trimmedDetail }),
      ...(locationSelection.type === "existing"
        ? { p_location_id: locationSelection.option.id }
        : { p_new_path: [locationSelection.name] }),
    });

    if (error) {
      setIsSubmitting(false);
      // Surfaced verbatim (matches sign-in-form.tsx's precedent for
      // Supabase-originated messages) — field values are left exactly as
      // typed so the user can just hit submit again, not re-enter anything.
      setSubmitError(error.message);
      return;
    }

    let newLocationSegments: LocationBreadcrumbSegment[] | null = null;
    let createdLocation: Location | undefined;

    if (locationSelection.type === "new") {
      // The `locations` snapshot doesn't know this place yet, so read the
      // resolved row back for its canonical name (an existing place keeps
      // its own casing). Falls back to the typed name if the read fails —
      // the item is already saved, so this must not turn into an error.
      const { data: resolved } = await supabase
        .from("locations")
        .select("id, name")
        .eq("id", data.location_id)
        .maybeSingle();
      const resolvedName = resolved?.name ?? locationSelection.name;
      newLocationSegments = [{ id: data.location_id, name: resolvedName }];
      createdLocation = { id: data.location_id, parentId: null, name: resolvedName };
    }

    setIsSubmitting(false);

    setCaptured({
      id: data.id,
      name: data.name,
      segments: newLocationSegments ?? getBreadcrumbSegments(data.location_id, locations),
      detail: data.detail ?? undefined,
    });
    onStashed?.({ itemId: data.id, createdLocation });
  }

  function handleLocationSelect(selection: AutocompleteSelection) {
    setLocationSelection(selection);
    // Clears a stale "Choose a location…" error the moment the user actually
    // resolves one — without this, picking a real location left the old
    // error (and the aria-invalid/aria-describedby pointing at it) visible
    // right next to the new "Selected: …" confirmation line until the next
    // submit, which is a real self-contradiction, not just staleness.
    if (selection.type === "existing") {
      setFieldErrors((previous) => ({ ...previous, location: undefined }));
    }
  }

  function handleAddAnother() {
    setName("");
    setDetail("");
    setLocationSelection(null);
    setFieldErrors({});
    setCaptured(null);
  }

  if (captured && embedded) {
    return (
      <div role="status" className="flex flex-col gap-2 rounded-[9px] border-[1.5px] border-line p-3">
        <p className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">Added</p>
        <p className="text-[15px] font-semibold text-ink">{captured.name}</p>
        <LocationBreadcrumb segments={captured.segments} />
        {captured.detail ? <p className="text-[12px] text-mid">{captured.detail}</p> : null}
      </div>
    );
  }

  if (captured) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
        <div>
          <p className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">Added</p>
          <p className="text-[15px] font-semibold text-ink">{captured.name}</p>
        </div>
        <LocationBreadcrumb segments={captured.segments} />
        {captured.detail ? <p className="text-[12px] text-mid">{captured.detail}</p> : null}
        <p className="text-[10.5px] text-mid">Saved. It shows up on Home and in Browse right away.</p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/items/${captured.id}`}
            className="inline-flex items-center justify-center rounded-[8px] bg-ink px-[10px] py-[10px] text-[13px] font-semibold text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            View item
          </Link>
          <Button type="button" variant="secondary" onClick={handleAddAnother}>
            Add another
          </Button>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-[8px] px-[10px] py-[10px] text-[13px] font-semibold text-ink underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <FormField
        id="stash-name"
        label="Name"
        type="text"
        value={name}
        onChange={setName}
        error={fieldErrors.name}
        disabled={isSubmitting}
      />

      <div>
        <LocationAutocomplete
          label="Location"
          options={locationOptions}
          onSelect={handleLocationSelect}
          describedBy={fieldErrors.location ? LOCATION_ERROR_ID : undefined}
          disabled={isSubmitting}
        />
        {locationSelection?.type === "existing" ? (
          <p className="mt-1 text-[11px] text-mid">Selected: {locationSelection.option.path}</p>
        ) : null}
        {fieldErrors.location ? (
          <p id={LOCATION_ERROR_ID} role="alert" className="mt-1 text-[10.5px] text-mid">
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
        <p role="alert" className="text-[11.5px] text-mid">
          {submitError}
        </p>
      ) : null}

      <Button type="submit" variant="primary" isLoading={isSubmitting}>
        {isSubmitting ? "Adding…" : "Add item"}
      </Button>
    </form>
  );
}
