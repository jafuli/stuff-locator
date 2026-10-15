import type { Ref } from "react";

export interface StuffSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}

/**
 * The Stuff screen's search field — shared by Home (which filters in place)
 * and the top of Browse (which hands the query to Home), so both show the
 * same control.
 *
 * type="text" + explicit role="searchbox" rather than type="search":
 * Chromium injects a client-only inline style onto native
 * <input type="search"> elements (its own clear-button bookkeeping), which
 * caused a real hydration mismatch against the server-rendered HTML. This
 * sidesteps that while keeping the same accessible role and visual result.
 */
export function StuffSearchInput({ value, onChange, ref }: StuffSearchInputProps) {
  return (
    <div role="search">
      <label htmlFor="stuff-search" className="sr-only">
        Search your stuff
      </label>
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
        className="w-full rounded-[9px] border-[1.5px] border-line px-[10px] py-[8px] text-[12.5px] text-ink outline-none placeholder:text-mid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      />
    </div>
  );
}
