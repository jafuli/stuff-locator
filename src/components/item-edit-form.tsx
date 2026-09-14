"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { LocationAutocomplete, type AutocompleteSelection } from "@/components/location-autocomplete";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { getBreadcrumbSegments, type LocationBreadcrumbSegment, type LocationOption } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";
// Reused directly rather than duplicated: the validation rules for editing
// an item's name/location are identical to Stash's ("empty name" / "no
// resolved location" are rejected the same way), and these functions
// aren't Stash-specific despite the module's name.
import { validateItemName, validateLocationSelection } from "@/lib/stash-validation";

export interface ItemEditFormProps {
  item: Item;
  /** Full-path options to feed LocationAutocomplete. */
  locationOptions: readonly LocationOption[];
  /** Raw location tree, needed to resolve a selected id into breadcrumb segments for the success state. */
  locations: readonly Location[];
}

interface FieldErrors {
  name?: string;
  location?: string;
}

interface CapturedEdit {
  name: string;
  segments: LocationBreadcrumbSegment[];
  detail?: string;
}

const LOCATION_ERROR_ID = "item-edit-location-error";

type Mode = "editing" | "confirming-delete" | "edited" | "deleted";

/**
 * Fixture-only edit form for an existing item — mirrors stash-form.tsx's
 * shape closely, but starts pre-filled from the item passed in rather than
 * blank. There is deliberately no backend call anywhere in this component:
 * a successful edit or delete only updates local state, never ITEMS
 * (src/lib/fixtures/items.ts) — neither persists across a reload or shows
 * up on Home/Browse/Search after this. That's a deliberate scope boundary
 * for this task (see the PR description), not a bug.
 *
 * Delete uses a plain two-step inline confirmation (Delete → Cancel/
 * confirm), not a <dialog>/modal — this app has no existing modal pattern
 * to match, and every other "are you sure"-shaped moment here (Stash's and
 * Add-location's success states) is already an inline panel replacing the
 * form, not an overlay. Consistent with that, not a new interaction model.
 */
export function ItemEditForm({ item, locationOptions, locations }: ItemEditFormProps) {
  const initialLocation = locationOptions.find((option) => option.id === item.locationId) ?? null;

  const [name, setName] = useState(item.name);
  const [detail, setDetail] = useState(item.detail ?? "");
  const [locationSelection, setLocationSelection] = useState<AutocompleteSelection | null>(
    initialLocation ? { type: "existing", option: initialLocation } : null,
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [mode, setMode] = useState<Mode>("editing");
  const [captured, setCaptured] = useState<CapturedEdit | null>(null);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {
      name: validateItemName(name),
      location: validateLocationSelection(locationSelection),
    };
    setFieldErrors(errors);

    // The `locationSelection.type !== "existing"` check (rather than
    // trusting `errors.location` alone) is what lets TypeScript narrow the
    // discriminated union below without a non-null assertion — same
    // reasoning as stash-form.tsx's own handleSubmit.
    if (errors.name || errors.location || locationSelection?.type !== "existing") {
      return;
    }

    setCaptured({
      name: name.trim(),
      segments: getBreadcrumbSegments(locationSelection.option.id, locations),
      detail: detail.trim() === "" ? undefined : detail.trim(),
    });
    setMode("edited");
  }

  function handleLocationSelect(selection: AutocompleteSelection) {
    setLocationSelection(selection);
    // Clears a stale location error the moment a real selection is made —
    // same reasoning as stash-form.tsx's handleLocationSelect.
    if (selection.type === "existing") {
      setFieldErrors((previous) => ({ ...previous, location: undefined }));
    }
  }

  if (mode === "deleted") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
        <div>
          <p className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">Deleted</p>
          <p className="text-[15px] font-semibold text-ink">{item.name}</p>
        </div>
        <p className="text-[10.5px] text-mid">
          This is a fixture-only preview — the deletion doesn&apos;t persist across a reload or anywhere else in
          the app.
        </p>
        <Link
          href="/"
          className="inline-flex w-fit items-center justify-center rounded-[8px] px-[10px] py-[10px] text-[13px] font-semibold text-ink underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Back to home
        </Link>
      </div>
    );
  }

  if (mode === "edited" && captured) {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
        <div>
          <p className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">Updated</p>
          <p className="text-[15px] font-semibold text-ink">{captured.name}</p>
        </div>
        <LocationBreadcrumb segments={captured.segments} />
        {captured.detail ? <p className="text-[12px] text-mid">{captured.detail}</p> : null}
        <p className="text-[10.5px] text-mid">
          This is a fixture-only preview — edits don&apos;t persist across a reload or anywhere else in the app.
        </p>
        <Link
          href={`/items/${item.id}`}
          className="inline-flex w-fit items-center justify-center rounded-[8px] px-[10px] py-[10px] text-[13px] font-semibold text-ink underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Back to item
        </Link>
      </div>
    );
  }

  if (mode === "confirming-delete") {
    return (
      <div className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
        <h2 className="text-[13px] font-semibold text-ink">Delete this item?</h2>
        <p className="text-[11px] text-mid">
          {item.name} will be removed. This can&apos;t be undone.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => { setMode("editing"); }}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => { setMode("deleted"); }}>
            Delete item
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-3">
        <FormField
          id="item-edit-name"
          label="Name"
          type="text"
          value={name}
          onChange={setName}
          error={fieldErrors.name}
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
          id="item-edit-detail"
          label="Detail (optional)"
          type="text"
          value={detail}
          onChange={setDetail}
        />

        <Button type="submit" variant="primary">
          Save changes
        </Button>
      </form>

      <Button type="button" variant="secondary" onClick={() => { setMode("confirming-delete"); }}>
        Delete item
      </Button>
    </div>
  );
}
