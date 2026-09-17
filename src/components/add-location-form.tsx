"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { LocationAutocomplete, type AutocompleteSelection } from "@/components/location-autocomplete";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { getBreadcrumbSegments, type LocationBreadcrumbSegment, type LocationOption } from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";
import { validateLocationName, validateParentSelection } from "@/lib/location-validation";
import { createClient } from "@/server/db/client";

export interface AddLocationFormProps {
  /** Full-path options to feed the parent-location LocationAutocomplete. */
  locationOptions: readonly LocationOption[];
  /** Raw location tree, needed to resolve a selected parent id into breadcrumb segments for the success state. */
  locations: readonly Location[];
  /** The signed-in caller's household — every insert is scoped to this. */
  householdId: string;
}

interface FieldErrors {
  name?: string;
  parent?: string;
}

interface CapturedLocation {
  name: string;
  segments: LocationBreadcrumbSegment[];
}

const PARENT_ERROR_ID = "add-location-parent-error";

/**
 * Add-location form, backed by a real Supabase write: submit INSERTs into
 * `locations` directly from the browser client (RLS-gated, no route
 * handler — mirrors stash-form.tsx's shape, a plain single-table write with
 * no cross-table invariant a client insert can violate on its own thanks to
 * locations_parent_household_consistency, so it doesn't need the RPC
 * treatment CLAUDE.md reserves for writes that carry invariants). A parent
 * outside the caller's household can't even be selected — the autocomplete
 * only ever offers this household's own locations — and is backstopped at
 * the data layer by that same trigger if bypassed.
 */
export function AddLocationForm({ locationOptions, locations, householdId }: AddLocationFormProps) {
  const [name, setName] = useState("");
  const [parentSelection, setParentSelection] = useState<AutocompleteSelection | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [captured, setCaptured] = useState<CapturedLocation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {
      name: validateLocationName(name),
      parent: validateParentSelection(parentSelection),
    };
    setFieldErrors(errors);

    if (errors.name || errors.parent) {
      return;
    }

    const trimmedName = name.trim();
    // Unlike Stash's required location field, `parentSelection` being
    // `null` (or, after the check above, anything other than "existing")
    // here is a valid, top-level result — no ancestor segments to prepend.
    const parentId = parentSelection?.type === "existing" ? parentSelection.option.id : null;
    const parentSegments = parentId ? getBreadcrumbSegments(parentId, locations) : [];

    setSubmitError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { data, error } = await supabase
      .from("locations")
      .insert({ name: trimmedName, parent_id: parentId, household_id: householdId })
      .select()
      .single();

    setIsSubmitting(false);

    if (error) {
      // Surfaced verbatim (matches stash-form.tsx's precedent for
      // Supabase-originated messages) — field values are left exactly as
      // typed so the user can just hit submit again, not re-enter anything.
      setSubmitError(error.message);
      return;
    }

    setCaptured({
      name: data.name,
      segments: [...parentSegments, { id: data.id, name: data.name }],
    });
  }

  function handleParentSelect(selection: AutocompleteSelection) {
    setParentSelection(selection);
    // Clears a stale error the moment the user actually resolves an
    // existing location, mirroring stash-form.tsx's handleLocationSelect —
    // without this, picking a real parent left the old error visible right
    // next to the new "Selected: …" confirmation line.
    if (selection.type === "existing") {
      setFieldErrors((previous) => ({ ...previous, parent: undefined }));
    }
  }

  function handleAddAnother() {
    setName("");
    setParentSelection(null);
    setFieldErrors({});
    setCaptured(null);
    setSubmitError(null);
  }

  if (captured) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
        <div>
          <p className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">Added</p>
          <p className="text-[15px] font-semibold text-ink">{captured.name}</p>
        </div>
        <LocationBreadcrumb segments={captured.segments} />
        <p className="text-[10.5px] text-mid">
          Saved. It won&apos;t show up on Browse, Home, or Stash yet — those still read fixture data until their own
          real-data-wiring tasks land.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={handleAddAnother}>
            Add another
          </Button>
          <Link
            href="/browse"
            className="inline-flex items-center justify-center rounded-[8px] px-[10px] py-[10px] text-[13px] font-semibold text-ink underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Back to Browse
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <FormField
        id="add-location-name"
        label="Name"
        type="text"
        value={name}
        onChange={setName}
        error={fieldErrors.name}
        disabled={isSubmitting}
      />

      <div>
        <LocationAutocomplete
          label="Parent location (optional)"
          options={locationOptions}
          onSelect={handleParentSelect}
          describedBy={fieldErrors.parent ? PARENT_ERROR_ID : undefined}
          disabled={isSubmitting}
        />
        {parentSelection?.type === "existing" ? (
          <p className="mt-1 text-[11px] text-mid">Selected: {parentSelection.option.path}</p>
        ) : null}
        {fieldErrors.parent ? (
          <p id={PARENT_ERROR_ID} role="alert" className="mt-1 text-[10.5px] text-mid">
            {fieldErrors.parent}
          </p>
        ) : null}
      </div>

      {submitError ? (
        <p role="alert" className="text-[11.5px] text-mid">
          {submitError}
        </p>
      ) : null}

      <Button type="submit" variant="primary" isLoading={isSubmitting}>
        {isSubmitting ? "Adding…" : "Add location"}
      </Button>
    </form>
  );
}
