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

export interface StashFormProps {
  /** Full-path options to feed LocationAutocomplete. */
  locationOptions: readonly LocationOption[];
  /** Raw location tree, needed to resolve a selected id into breadcrumb segments for the success state. */
  locations: readonly Location[];
}

interface FieldErrors {
  name?: string;
  location?: string;
}

interface CapturedStash {
  name: string;
  segments: LocationBreadcrumbSegment[];
  detail?: string;
}

const LOCATION_ERROR_ID = "stash-location-error";

/**
 * Fixture-only add-item form. There is deliberately no backend call anywhere
 * in this component — "submit" just moves local state into a success view,
 * the same way sign-up-form.tsx renders its "check your email" state inline
 * rather than as a separate route. The captured item is never written back
 * into ITEMS (src/lib/fixtures/items.ts), so it will not appear on Home,
 * Browse, or in Find after this — that lands with the future real-data-
 * wiring task, not here.
 */
export function StashForm({ locationOptions, locations }: StashFormProps) {
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [locationSelection, setLocationSelection] = useState<AutocompleteSelection | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [captured, setCaptured] = useState<CapturedStash | null>(null);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
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

    setCaptured({
      name: name.trim(),
      segments: getBreadcrumbSegments(locationSelection.option.id, locations),
      detail: detail.trim() === "" ? undefined : detail.trim(),
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
          This is a fixture-only preview — added items don&apos;t show up on Home, Browse, or Find yet.
        </p>
        <div className="flex flex-wrap gap-2">
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
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
      <FormField id="stash-name" label="Name" type="text" value={name} onChange={setName} error={fieldErrors.name} />

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

      <FormField id="stash-detail" label="Detail (optional)" type="text" value={detail} onChange={setDetail} />

      <Button type="submit" variant="primary">
        Add item
      </Button>
    </form>
  );
}
