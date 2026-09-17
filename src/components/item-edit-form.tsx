"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
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
import { createClient } from "@/server/db/client";

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
 * Edit form for an existing item, backed by real Supabase writes: mirrors
 * stash-form.tsx's shape, but starts pre-filled from the item passed in
 * rather than blank.
 *
 * The edit-vs-move split (this task's AC #2): a plain field UPDATE (name,
 * detail) handles everything EXCEPT a location change — location is the one
 * field carrying the cross-household invariant (an item's location_id must
 * belong to the same household), which is exactly what move_item's own
 * migration exists to enforce atomically and reject with a specific error.
 * When the location changed, move_item runs FIRST (before any name/detail
 * update) — it's the one call that can legitimately fail (a destination
 * outside the household), so failing before touching anything else keeps
 * the failure surface small. If name/detail also changed, a second, plain
 * UPDATE follows. These two writes are not atomic with each other (per
 * CLAUDE.md: two SDK/RPC calls can never share a transaction) — a move
 * that succeeds followed by a field update that then fails would leave the
 * item moved but not renamed. Flagged in the PR rather than silently
 * assumed away; closing that gap would need a new combined RPC, which is
 * out of this task's scope.
 *
 * Delete performs a real DELETE of the item row directly (RLS-protected,
 * no RPC) — a single item's delete carries no cross-table invariant, unlike
 * delete_container (which must reject a non-empty location). Uses a plain
 * two-step inline confirmation (Delete → Cancel/confirm), not a <dialog>/
 * modal — this app has no existing modal pattern to match, and every other
 * "are you sure"-shaped moment here (Stash's and Add-location's success
 * states) is already an inline panel replacing the form, not an overlay.
 */
export function ItemEditForm({ item, locationOptions, locations }: ItemEditFormProps) {
  const initialLocation = locationOptions.find((option) => option.id === item.locationId) ?? null;

  const [name, setName] = useState(item.name);
  const [detail, setDetail] = useState(item.detail ?? "");
  const [locationSelection, setLocationSelection] = useState<AutocompleteSelection | null>(
    initialLocation ? { type: "existing", option: initialLocation } : null,
  );
  // Mirrors LocationAutocomplete's own raw input text (see its onInputChange
  // doc comment). Because this form — unlike Stash's blank one — starts
  // with a real selection already in place, typing into the combobox
  // without finishing a new selection would otherwise leave that stale
  // selection standing with no error and no visible indication that it no
  // longer matches what's on screen. Tracked here purely to catch that.
  const [pendingLocationQuery, setPendingLocationQuery] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [mode, setMode] = useState<Mode>("editing");
  const [captured, setCaptured] = useState<CapturedEdit | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteHeadingRef = useRef<HTMLHeadingElement>(null);
  const cameFromConfirmRef = useRef(false);

  // Moves focus into the confirmation panel when it appears (so a screen
  // reader announces it rather than leaving focus on a now-unmounted
  // button), and back to the "Delete item" trigger when Cancel returns to
  // the ordinary form — mirrors this doc comment's own "not a new
  // interaction model" stance by keeping the mechanics plain (no focus
  // trap, no modal role), just making sure focus actually goes somewhere
  // sensible on both transitions instead of falling back to <body>.
  useEffect(() => {
    if (mode === "confirming-delete") {
      cameFromConfirmRef.current = true;
      deleteHeadingRef.current?.focus();
    } else if (mode === "editing" && cameFromConfirmRef.current) {
      cameFromConfirmRef.current = false;
      deleteTriggerRef.current?.focus();
    }
  }, [mode]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // Dangling typed text that never became a real selection is treated
    // the same as an unresolved location — including when it's shadowing a
    // perfectly valid `locationSelection` left over from before the user
    // started typing again (see pendingLocationQuery's own comment above).
    const locationError =
      validateLocationSelection(locationSelection) ??
      (pendingLocationQuery.trim() !== ""
        ? "Pick an existing location from the list — adding a new one isn't supported here yet."
        : undefined);

    const errors: FieldErrors = {
      name: validateItemName(name),
      location: locationError,
    };
    setFieldErrors(errors);

    // The `locationSelection.type !== "existing"` check (rather than
    // trusting `errors.location` alone) is what lets TypeScript narrow the
    // discriminated union below without a non-null assertion — same
    // reasoning as stash-form.tsx's own handleSubmit.
    if (errors.name || errors.location || locationSelection?.type !== "existing") {
      return;
    }

    const trimmedName = name.trim();
    const trimmedDetail = detail.trim();
    const newLocationId = locationSelection.option.id;
    const locationChanged = newLocationId !== item.locationId;
    const fieldsChanged = trimmedName !== item.name || trimmedDetail !== (item.detail ?? "");

    setSubmitError(null);
    setIsSubmitting(true);
    const supabase = createClient();

    let resultLocationId = item.locationId;
    let resultName = item.name;
    let resultDetail = item.detail;

    if (locationChanged) {
      const { data, error } = await supabase.rpc("move_item", {
        p_item_id: item.id,
        p_new_location_id: newLocationId,
      });
      if (error) {
        setIsSubmitting(false);
        setSubmitError(error.message);
        return;
      }
      resultLocationId = data.location_id;
    }

    if (fieldsChanged) {
      const { data, error } = await supabase
        .from("items")
        .update({ name: trimmedName, detail: trimmedDetail === "" ? null : trimmedDetail })
        .eq("id", item.id)
        .select()
        .single();
      if (error) {
        setIsSubmitting(false);
        setSubmitError(error.message);
        return;
      }
      resultName = data.name;
      resultDetail = data.detail ?? undefined;
    }

    setIsSubmitting(false);
    setCaptured({
      name: resultName,
      segments: getBreadcrumbSegments(resultLocationId, locations),
      detail: resultDetail,
    });
    setMode("edited");
  }

  async function handleConfirmDelete() {
    setDeleteError(null);
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("items").delete().eq("id", item.id);
    setIsDeleting(false);

    if (error) {
      setDeleteError(error.message);
      return;
    }
    setMode("deleted");
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
        {/* tabIndex={-1}: programmatically focusable (see the effect above)
            without joining the regular tab order — the heading itself
            isn't an action, the two buttons below it are. */}
        <h2 ref={deleteHeadingRef} tabIndex={-1} className="text-[13px] font-semibold text-ink outline-none">
          Delete this item?
        </h2>
        <p className="text-[11px] text-mid">
          {item.name} will be removed. This can&apos;t be undone.
        </p>
        {deleteError ? (
          <p role="alert" className="text-[11.5px] text-mid">
            {deleteError}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isDeleting}
            onClick={() => {
              setDeleteError(null);
              setMode("editing");
            }}
          >
            Cancel
          </Button>
          <Button type="button" variant="primary" isLoading={isDeleting} onClick={() => void handleConfirmDelete()}>
            {isDeleting ? "Deleting…" : "Delete item"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
        <FormField
          id="item-edit-name"
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
            onInputChange={setPendingLocationQuery}
            describedBy={fieldErrors.location ? LOCATION_ERROR_ID : undefined}
            disabled={isSubmitting}
          />
          {locationSelection?.type === "existing" && pendingLocationQuery.trim() === "" ? (
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
          disabled={isSubmitting}
        />

        {submitError ? (
          <p role="alert" className="text-[11.5px] text-mid">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" variant="primary" isLoading={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <Button
        ref={deleteTriggerRef}
        type="button"
        variant="secondary"
        disabled={isSubmitting}
        onClick={() => {
          setMode("confirming-delete");
        }}
      >
        Delete item
      </Button>
    </div>
  );
}
