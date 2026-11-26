"use client";

import { useEffect, useRef, useState, type RefCallback } from "react";
import { firstInvalidField } from "@/lib/form-errors";

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

/**
 * Field errors for a form, with the behaviour every form in the app shares:
 *
 * - `clear(field)` drops one field's error as soon as that field changes,
 *   rather than leaving "Enter your email" under an email being typed. Only
 *   that field's: editing Password leaves "Passwords don't match" under
 *   Confirm until Confirm changes or the form is submitted again. A
 *   form-level error (the one under the submit button) is the form's own
 *   state and stays until the next submit.
 * - `report(errors)` shows a submit's errors and moves focus to the first
 *   invalid field, in `order` (on-screen order). Focus moves after the
 *   render that shows the error, so the field is already `aria-invalid` and
 *   described by its message when it receives focus.
 *
 * `inputs[field]` is the ref for that field's input (FormField takes `ref`).
 */
export function useFieldErrors<Field extends string>(order: readonly Field[]) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<Field>>({});
  // Each field's input element, kept by a stable callback ref per field
  // (both made once, in a lazy state initialiser).
  const [elements] = useState(() => new Map<Field, HTMLInputElement>());
  const [inputs] = useState(
    () =>
      Object.fromEntries(
        order.map((field) => [
          field,
          (element: HTMLInputElement | null) => {
            if (element === null) {
              elements.delete(field);
            } else {
              elements.set(field, element);
            }
          },
        ]),
      ) as Record<Field, RefCallback<HTMLInputElement>>,
  );
  const focusAfterRender = useRef<Field | null>(null);

  useEffect(() => {
    const field = focusAfterRender.current;
    focusAfterRender.current = null;
    if (field !== null) {
      elements.get(field)?.focus();
    }
  }, [fieldErrors, elements]);

  /** Shows these errors; returns true (and focuses the first) when there are any. */
  function report(errors: FieldErrors<Field>): boolean {
    const first = firstInvalidField(errors, order);
    focusAfterRender.current = first;
    // A fresh object every time, so a repeated failed submit refocuses too.
    setFieldErrors({ ...errors });
    return first !== null;
  }

  function clear(field: Field) {
    setFieldErrors((previous) => (previous[field] === undefined ? previous : { ...previous, [field]: undefined }));
  }

  function reset() {
    setFieldErrors({});
  }

  return { fieldErrors, report, clear, reset, inputs };
}
