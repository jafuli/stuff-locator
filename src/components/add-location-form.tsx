"use client";

import Link from "next/link";
import { useState, type SubmitEvent } from "react";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";
import { LocationPathPicker } from "@/components/location-path-picker";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { getBreadcrumbSegments, type LocationBreadcrumbSegment } from "@/lib/fixtures/location-path";
import type { Location } from "@/lib/fixtures/types";
import { validateLocationName } from "@/lib/location-validation";
import { lastExistingId, type PathChip } from "@/lib/location-path-picker";
import { createClient } from "@/server/db/client";

export interface AddLocationFormProps {
  /** Every place in the household: the parent picker's options and the success breadcrumb's source. */
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
 * Add-location form, backed by a real Supabase write: submit calls the
 * `create_location` RPC. Direct writes on `locations` are revoked (ADR 0011:
 * every write goes through a function so the activity log can't be
 * bypassed). A parent outside the caller's household can't even be selected
 * — the autocomplete only ever offers this household's own locations — and
 * the function re-checks membership if bypassed. This form is removed in
 * Locations 6/7, when Browse gains "+ Add a place here".
 */
export function AddLocationForm({ locations }: AddLocationFormProps) {
  const [name, setName] = useState("");
  const [parentChips, setParentChips] = useState<PathChip[]>([]);
  const [pendingParentText, setPendingParentText] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [captured, setCaptured] = useState<CapturedLocation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const errors: FieldErrors = {
      name: validateLocationName(name),
      // The parent is optional (no chips = top level), but text typed into
      // the field that never became a chip is not silently dropped.
      parent: pendingParentText.trim() === "" ? undefined : "Pick a place from the list, or clear the field.",
    };
    setFieldErrors(errors);

    if (errors.name || errors.parent) {
      return;
    }

    const trimmedName = name.trim();
    // Unlike Stash's required location field, no chips here is a valid,
    // top-level result — no ancestor segments to prepend.
    const parentId = lastExistingId(parentChips);
    const parentSegments = parentId ? getBreadcrumbSegments(parentId, locations) : [];

    setSubmitError(null);
    setIsSubmitting(true);

    const supabase = createClient();
    const { data, error } = await supabase.rpc("create_location", {
      p_name: trimmedName,
      ...(parentId === null ? {} : { p_parent_id: parentId }),
    });

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

  function handleParentChange(next: PathChip[]) {
    setParentChips(next);
    setFieldErrors((previous) => ({ ...previous, parent: undefined }));
  }

  function handleAddAnother() {
    setName("");
    setParentChips([]);
    setPendingParentText("");
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
        <LocationPathPicker
          label="Parent location (optional)"
          locations={locations}
          value={parentChips}
          onChange={handleParentChange}
          onInputChange={setPendingParentText}
          describedBy={fieldErrors.parent ? PARENT_ERROR_ID : undefined}
          disabled={isSubmitting}
          pickOnly
        />
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
