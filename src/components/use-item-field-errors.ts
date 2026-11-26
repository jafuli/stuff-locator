"use client";

import { useFieldErrors, type FieldErrors } from "@/components/use-field-errors";

export type ItemField = "name" | "location";
export type ItemFieldErrors = FieldErrors<ItemField>;

/** On-screen order: Name above Location. */
const FIELD_ORDER: readonly ItemField[] = ["name", "location"];

/**
 * useFieldErrors for the item forms (Stash, onboarding's embedded Stash,
 * item edit). They attach `nameRef` to their Name input and `locationRef`
 * to the place picker's input.
 */
export function useItemFieldErrors() {
  const { inputs, ...rest } = useFieldErrors(FIELD_ORDER);
  return { ...rest, nameRef: inputs.name, locationRef: inputs.location };
}
