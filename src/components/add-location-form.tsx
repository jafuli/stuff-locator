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

export interface AddLocationFormProps {
  /** Full-path options to feed the parent-location LocationAutocomplete. */
  locationOptions: readonly LocationOption[];
  /** Raw location tree, needed to resolve a selected parent id into breadcrumb segments for the success state. */
  locations: readonly Location[];
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
 * Fixture-only add-location form. Mirrors stash-form.tsx's shape: there is
 * deliberately no backend call anywhere in this component — "submit" just
 * moves local state into a success view. The new location is never written
 * back into LOCATIONS (src/lib/fixtures/locations.ts), so it will not
 * appear on Browse, Home, or the Stash/edit-item location-autocomplete
 * after this — that's a deliberate scope boundary for this task (see the
 * PR description), not a bug.
 */
export function AddLocationForm({ locationOptions, locations }: AddLocationFormProps) {
  const [name, setName] = useState("");
  const [parentSelection, setParentSelection] = useState<AutocompleteSelection | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [captured, setCaptured] = useState<CapturedLocation | null>(null);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
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
    const parentSegments =
      parentSelection?.type === "existing" ? getBreadcrumbSegments(parentSelection.option.id, locations) : [];

    setCaptured({
      name: trimmedName,
      // A fabricated id: this location doesn't exist in fixture data (see
      // the PR description above), so there's no real id to link to — the
      // non-linked LocationBreadcrumb render mode used below never reads
      // it, only each segment's name.
      segments: [...parentSegments, { id: "new-location-preview", name: trimmedName }],
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
          This is a fixture-only preview — new locations don&apos;t show up on Browse, Home, or Stash yet.
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
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <FormField
        id="add-location-name"
        label="Name"
        type="text"
        value={name}
        onChange={setName}
        error={fieldErrors.name}
      />

      <div>
        <LocationAutocomplete
          label="Parent location (optional)"
          options={locationOptions}
          onSelect={handleParentSelect}
          describedBy={fieldErrors.parent ? PARENT_ERROR_ID : undefined}
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

      <Button type="submit" variant="primary">
        Add location
      </Button>
    </form>
  );
}
