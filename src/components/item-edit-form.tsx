"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { PathTrail } from "@/components/path-trail";
import { LocationPathPicker } from "@/components/location-path-picker";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { getBreadcrumbSegments, type LocationBreadcrumbSegment } from "@/lib/fixtures/location-path";
import type { Item, Location } from "@/lib/fixtures/types";
import { chipsForPlace, resolvePath, type PathChip } from "@/lib/location-path-picker";
// Reused directly rather than duplicated: the validation rules for editing
// an item's name/location are identical to Stash's ("empty name" / "no
// resolved location" are rejected the same way), and these functions
// aren't Stash-specific despite the module's name.
import { validateItemName, validateLocationPath } from "@/lib/stash-validation";
import { createClient } from "@/server/db/client";

export interface ItemEditFormProps {
  item: Item;
  /** Every place in the household — the picker searches and descends through these. */
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
 * One save is ONE call to `update_item`: name, detail and place are written
 * in a single transaction, and the function records an activity event only
 * for what actually changed (ADR 0011). Before Locations 3/7 this was
 * `move_item` followed by a plain UPDATE, which could leave an item moved but
 * not renamed; direct writes on `items` are now revoked, so that path is gone.
 *
 * Delete calls `delete_item` (it records the "deleted" event and what the
 * item's place was). Uses a plain two-step inline confirmation (Delete →
 * Cancel/confirm), an inline panel replacing the form rather than an overlay.
 * Browse's place deletion uses the shared Dialog instead (components/ui/
 * dialog.tsx); moving this one over is a reasonable follow-up, not done here.
 */
export function ItemEditForm({ item, locations }: ItemEditFormProps) {
  const [name, setName] = useState(item.name);
  const [detail, setDetail] = useState(item.detail ?? "");
  // Starts as the item's current place, as solid chips. Tapping a chip goes
  // back a level, so moving into a place that doesn't exist yet is "tap the
  // level you want to branch from, then type the new name".
  const [chips, setChips] = useState<PathChip[]>(() => chipsForPlace(item.locationId, locations));
  // Raw text in the picker's field, to catch text that never became a chip.
  const [pendingText, setPendingText] = useState("");
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

    const errors: FieldErrors = {
      name: validateItemName(name),
      location: validateLocationPath(chips, pendingText),
    };
    setFieldErrors(errors);

    const path = resolvePath(chips);
    if (errors.name || errors.location || path === null) {
      return;
    }

    const trimmedName = name.trim();
    const trimmedDetail = detail.trim();

    setSubmitError(null);
    setIsSubmitting(true);
    const supabase = createClient();

    // Optional arguments are left out rather than sent as null: an omitted
    // detail clears it, and an unchanged place is a no-op in the function.
    const { data, error } = await supabase.rpc("update_item", {
      p_item_id: item.id,
      p_name: trimmedName,
      ...(trimmedDetail === "" ? {} : { p_detail: trimmedDetail }),
      ...(path.locationId === null ? {} : { p_location_id: path.locationId }),
      ...(path.newPath.length === 0 ? {} : { p_new_path: path.newPath }),
    });

    setIsSubmitting(false);

    if (error) {
      setSubmitError(error.message);
      return;
    }

    // A just-created place isn't in the `locations` snapshot, so name the
    // levels from the chips the person built.
    const knownSegments = getBreadcrumbSegments(data.location_id, locations);
    setCaptured({
      name: data.name,
      segments:
        knownSegments.length > 0
          ? knownSegments
          : chips.map((chip, index) => ({
              id:
                index === chips.length - 1
                  ? data.location_id
                  : chip.kind === "existing"
                    ? chip.id
                    : `new-${String(index)}`,
              name: chip.name,
            })),
      detail: data.detail ?? undefined,
    });
    setMode("edited");
  }

  async function handleConfirmDelete() {
    setDeleteError(null);
    setIsDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_item", { p_item_id: item.id });
    setIsDeleting(false);

    if (error) {
      setDeleteError(error.message);
      return;
    }
    setMode("deleted");
  }

  function handleChipsChange(next: PathChip[]) {
    setChips(next);
    if (next.length > 0) {
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
        <PathTrail segments={captured.segments} printIn />
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
        <p className="text-[11px] text-mid">{item.name} will be removed. This can&apos;t be undone.</p>
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
          <LocationPathPicker
            label="Location"
            locations={locations}
            value={chips}
            onChange={handleChipsChange}
            onInputChange={setPendingText}
            describedBy={fieldErrors.location ? LOCATION_ERROR_ID : undefined}
            disabled={isSubmitting}
          />
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
