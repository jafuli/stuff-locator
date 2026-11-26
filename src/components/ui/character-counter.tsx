import { cn } from "@/lib/cn";
import { limitStatus } from "@/lib/limits";

export interface CharacterCounterProps {
  /** Id of the live region, for the field's `aria-describedby`. */
  id: string;
  /** The field's current value. */
  value: string;
  /** The field's maxLength. */
  max: number;
  className?: string;
}

/**
 * "72 / 80" under a text field, from 90% of its limit (limitStatus), and
 * nothing below that. Typing stops at the field's own maxLength, and a long
 * paste is cut there, so the counter is what makes that cut visible.
 *
 * Screen readers hear it only at the limit, not on every keystroke: the
 * visible count is aria-hidden, and a separate polite live region holds
 * text only when the limit is reached. At the limit the field also points
 * at that region with aria-describedby (counterDescribedBy), so focusing a
 * full field says so too.
 *
 * Length is the field's own `value.length` (UTF-16 units), the same unit
 * maxLength counts in, so the two always agree.
 */
export function CharacterCounter({ id, value, max, className }: CharacterCounterProps) {
  const status = limitStatus(value.length, max);
  // Nothing at all below 90%. The live region mounts (empty) at "near", so
  // that filling it at the limit is announced; a region that arrives
  // already holding its text often isn't.
  if (status === "normal") {
    return null;
  }
  return (
    <>
      <p aria-hidden="true" className={cn("mt-1 text-right text-meta text-muted tabular-nums", className)}>
        {value.length} / {max}
      </p>
      <p id={id} aria-live="polite" className="sr-only">
        {status === "reached" ? `Limit reached: ${String(max)} of ${String(max)} characters.` : ""}
      </p>
    </>
  );
}

/** The counter's id while it has something to say, for the field's aria-describedby. */
export function counterDescribedBy(id: string, value: string, max: number | undefined): string | null {
  return max !== undefined && limitStatus(value.length, max) === "reached" ? id : null;
}
