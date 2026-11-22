"use client";

import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { LocationPathPicker } from "@/components/location-path-picker";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import type { Item, Location } from "@/lib/fixtures/types";
import { chipsForPlace, resolvePath, type PathChip } from "@/lib/location-path-picker";
// Reused directly rather than duplicated: the validation rules for editing
// an item's name/location are identical to Stash's ("empty name" / "no
// resolved location" are rejected the same way), and these functions
// aren't Stash-specific despite the module's name.
import { validateItemName, validateLocationPath } from "@/lib/stash-validation";
import { createClient } from "@/server/db/client";
import { useItemFieldErrors } from "@/components/use-item-field-errors";
import { itemSavedHref } from "@/lib/flash-notice";

export interface ItemEditFormProps {
  item: Item;
  /** Every place in the household — the picker searches and descends through these. */
  locations: readonly Location[];
}

const LOCATION_ERROR_ID = "item-edit-location-error";

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
 * A save isn't shown inside this form: it replaces the history entry with
 * the item's own page, carrying a one-off "Saved" notice (src/lib/
 * flash-notice.ts). `replace`, not `push`, so browser Back can't return to
 * this form showing the values from before the save.
 *
 * Deleting lives on the item's own page (ItemDeleteButton), not here.
 */
export function ItemEditForm({ item, locations }: ItemEditFormProps) {
  const router = useRouter();
  const [name, setName] = useState(item.name);
  const [detail, setDetail] = useState(item.detail ?? "");
  // Starts as the item's current place, as solid chips. Tapping a chip goes
  // back a level, so moving into a place that doesn't exist yet is "tap the
  // level you want to branch from, then type the new name".
  const [chips, setChips] = useState<PathChip[]>(() => chipsForPlace(item.locationId, locations));
  // Raw text in the picker's field, to catch text that never became a chip.
  const [pendingText, setPendingText] = useState("");
  const { fieldErrors, report, clear, nameRef, locationRef } = useItemFieldErrors();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

    if (error) {
      setIsSubmitting(false);
      setSubmitError(error.message);
      return;
    }

    // Left disabled while the navigation lands, so a second tap can't save
    // twice. replace + refresh: the item page is a Server Component, and
    // refresh makes sure it re-reads rather than reusing a cached payload.
    router.replace(itemSavedHref(data.id));
    router.refresh();
  }

  // A field's error clears as soon as that field changes, not at the next submit.
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

  return (
    <form noValidate onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <FormField
        ref={nameRef}
        id="item-edit-name"
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
        id="item-edit-detail"
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
        {isSubmitting ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
