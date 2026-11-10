import type { Ref } from "react";
import { SearchIcon } from "@/components/icons";

export interface StuffSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Fired when the field gains focus — Find uses it as the first sign of intent to search. */
  onFocus?: () => void;
  ref?: Ref<HTMLInputElement>;
}

/**
 * The Stuff screen's search field — shared by Home (which filters in place)
 * and the top of Browse (which hands the query to Home), so both show the
 * same control: a SearchField — surface fill, control-height, shadow at rest,
 * border-strong on focus, with a line search icon (decorative; the label is
 * for assistive tech).
 *
 * type="text" + explicit role="searchbox" rather than type="search":
 * Chromium injects a client-only inline style onto native
 * <input type="search"> elements (its own clear-button bookkeeping), which
 * caused a real hydration mismatch against the server-rendered HTML. This
 * sidesteps that while keeping the same accessible role and visual result.
 */
export function StuffSearchInput({ value, onChange, onFocus, ref }: StuffSearchInputProps) {
  return (
    <div role="search" className="relative">
      <label htmlFor="stuff-search" className="sr-only">
        Search your stuff
      </label>
      <SearchIcon className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
      <input
        ref={ref}
        id="stuff-search"
        type="text"
        role="searchbox"
        placeholder="Search…"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onFocus={onFocus}
        className="min-h-control-height w-full rounded-control border border-border-control bg-surface pr-4 pl-11 text-body text-ink shadow-control outline-none placeholder:text-muted focus-visible:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
    </div>
  );
}
