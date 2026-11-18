/**
 * The first field, in on-screen order, that has an error — where focus goes
 * after a failed submit, so the person lands on the thing to fix instead of
 * staying on the submit button. Null when every field is valid.
 */
export function firstInvalidField<Field extends string>(
  errors: Partial<Record<Field, string | undefined>>,
  order: readonly Field[],
): Field | null {
  return order.find((field) => errors[field] !== undefined) ?? null;
}
