import type { ChangeEvent } from "react";
import { cn } from "@/lib/cn";

export interface FormFieldProps {
  id: string;
  label: string;
  type: "email" | "password";
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoComplete?: string;
}

/**
 * A real labelled input + inline error, matching LocationAutocomplete's
 * label/input/error styling (src/components/location-autocomplete.tsx) so
 * the auth forms don't invent a second visual language for the same thing.
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
      <label htmlFor={id} className="mb-[3px] block text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">
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
          "w-full rounded-[7px] border-[1.5px] px-[9px] py-[7px] text-[12.5px] text-ink outline-none",
          "placeholder:text-[#b0b0b0] disabled:opacity-60",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
          // No dedicated error/danger color exists in this token set yet
          // (--note is explicitly scoped to the autocomplete's "+ New
          // place" row, per its own comment in globals.css) — border-ink
          // plus the visible role="alert" text below is the same "invalid"
          // signal LocationAutocomplete's own error state uses.
          error ? "border-ink" : "border-line",
        )}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-[10.5px] text-mid">
          {error}
        </p>
      ) : null}
    </div>
  );
}
