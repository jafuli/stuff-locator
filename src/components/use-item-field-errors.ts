"use client";

import { useEffect, useRef, useState } from "react";
import { firstInvalidField } from "@/lib/form-errors";

export type ItemField = "name" | "location";
export type ItemFieldErrors = Partial<Record<ItemField, string>>;

/** On-screen order: Name above Location. */
const FIELD_ORDER: readonly ItemField[] = ["name", "location"];

/**
 * Field errors for the item forms (Stash, onboarding's embedded Stash, item
 * edit), with the two behaviours they share:
 *
 * - `clear(field)` drops one field's error as soon as that field changes,
 *   rather than leaving "Enter a name" under a name that's been typed.
 * - `report(errors)` shows a submit's errors and moves focus to the first
 *   invalid field. Focus moves after the render that shows the error, so the
 *   field is already `aria-invalid` and described by its message when it
 *   receives focus.
 *
 * The forms attach `nameRef` and `locationRef` to their Name input and the
 * place picker's input.
 */
export function useItemFieldErrors() {
  const [fieldErrors, setFieldErrors] = useState<ItemFieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const locationRef = useRef<HTMLInputElement>(null);
  const focusAfterRender = useRef<ItemField | null>(null);

  useEffect(() => {
    const field = focusAfterRender.current;
    focusAfterRender.current = null;
    if (field === "name") {
      nameRef.current?.focus();
    } else if (field === "location") {
      locationRef.current?.focus();
    }
  }, [fieldErrors]);

  /** Shows these errors; returns true (and focuses the first) when there are any. */
  function report(errors: ItemFieldErrors): boolean {
    const first = firstInvalidField(errors, FIELD_ORDER);
    focusAfterRender.current = first;
    // A fresh object every time, so a repeated failed submit refocuses too.
    setFieldErrors({ ...errors });
    return first !== null;
  }

  function clear(field: ItemField) {
    setFieldErrors((previous) => (previous[field] === undefined ? previous : { ...previous, [field]: undefined }));
  }

  function reset() {
    setFieldErrors({});
  }

  return { fieldErrors, report, clear, reset, nameRef, locationRef };
}
