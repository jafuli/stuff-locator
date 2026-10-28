import type { ChangeEvent } from "react";
import { cn } from "@/lib/cn";

export interface FormFieldProps {
  id: string;
  label: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
}

/**
 * A real labelled input + inline error. The field sits on `surface` with a
 * visible label — the system's README flags the `border-control` token as below 3:1 on
 * its own, so the resting edge is never the only cue; focus and error switch
 * to the `border-strong` token, and an error also prints signal text (never a fill, and
 * never colour alone). 16px text keeps iOS from zooming on focus.
 * `type="text"` exists alongside email/password for plain fields (e.g.
 * stash-form.tsx's Name/Detail) that need this same label+error wiring but
 * aren't auth inputs.
 * `noValidate` lives on the parent <form> — this input keeps `type`/
 * `required`-adjacent semantics (mobile keyboard, autofill) but the forms
 * that use it decide what counts as valid and when to show it.
 */
export function FormField({ id, label, type, value, onChange, error, disabled = false, autoComplete }: FormFieldProps) {
  const errorId = `${id}-error`;

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-meta text-muted">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={handleChange}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "min-h-control-height w-full rounded-control border bg-surface px-4 text-body text-ink shadow-control outline-none",
          "placeholder:text-muted disabled:opacity-60",
          "focus-visible:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          error ? "border-border-strong" : "border-border-control",
        )}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-meta text-signal">
          {error}
        </p>
      ) : null}
    </div>
  );
}
