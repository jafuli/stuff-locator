"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { LocationAutocomplete, type AutocompleteSelection } from "@/components/location-autocomplete";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { getBreadcrumbSegments, type LocationBreadcrumbSegment, type LocationOption } from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";
import { validateItemName, validateLocationSelection } from "@/lib/stash-validation";
import { createClient } from "@/server/db/client";

export interface StashFormProps {
  /** Full-path options to feed LocationAutocomplete. */
  locationOptions: readonly LocationOption[];
  /** Raw location tree, needed to resolve a selected id into breadcrumb segments for the success state. */
  locations: readonly Location[];
  /** The signed-in caller's household — every insert is scoped to this. */
  householdId: string;
  /** The signed-in caller's id — written as `added_by` on the inserted row. */
  userId: string;
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
 * Add-item form, backed by a real Supabase write: submit INSERTs into
 * `items` directly from the browser client (RLS-gated, no route handler —
 * this is a plain single-table write with no cross-table invariant, unlike
 * move_item/move_container/delete_container/redeem_invite, so it doesn't
 * need the RPC treatment CLAUDE.md reserves for writes that carry
 * invariants). A location outside the caller's household is rejected by RLS
 * itself (`items_access`'s `is_household_member(household_id)` check) —
 * this component adds no redundant check of its own, per this task's AC.
 */
export function StashForm({ locationOptions, locations, householdId, userId }: StashFormProps) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [locationSelection, setLocationSelection] = useState<AutocompleteSelection | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [captured, setCaptured] = useState<CapturedStash | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {
      name: validateItemName(name),
      location: validateLocationSelection(locationSelection),
    };
    setFieldErrors(errors);

    // The `locationSelection.type !== "existing"` check (rather than trusting
    // `errors.location` alone) is what lets TypeScript narrow the
    // discriminated union below without a non-null assertion — it's the same
    // condition validateLocationSelection just checked, made visible here.
    if (errors.name || errors.location || locationSelection?.type !== "existing") {
      return;
    }

    const trimmedName = name.trim();
    const trimmedDetail = detail.trim();
    const locationId = locationSelection.option.id;

    setSubmitError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("items")
      .insert({
        name: trimmedName,
        location_id: locationId,
        detail: trimmedDetail === "" ? null : trimmedDetail,
        household_id: householdId,
        added_by: userId,
      })
      .select()
      .single();

    setIsSubmitting(false);

    if (error) {
      // Surfaced verbatim (matches sign-in-form.tsx's precedent for
      // Supabase-originated messages) — field values are left exactly as
      // typed so the user can just hit submit again, not re-enter anything.
      setSubmitError(error.message);
      return;
    }

    setCaptured({
      id: data.id,
      name: data.name,
      segments: getBreadcrumbSegments(locationId, locations),
      detail: data.detail ?? undefined,
    });
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

  if (captured) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
        <div>
          <p className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">Added</p>
          <p className="text-[15px] font-semibold text-ink">{captured.name}</p>
        </div>
        <LocationBreadcrumb segments={captured.segments} />
        {captured.detail ? <p className="text-[12px] text-mid">{captured.detail}</p> : null}
        <p className="text-[10.5px] text-mid">
          Saved. It won&apos;t show up on Home, Browse, or Find yet — those still read fixture data until their own
          real-data-wiring tasks land.
        </p>
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
