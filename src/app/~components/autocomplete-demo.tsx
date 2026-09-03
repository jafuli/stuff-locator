"use client";

import { useState } from "react";
import { LocationAutocomplete, type AutocompleteSelection } from "@/components/location-autocomplete";
import type { LocationOption } from "@/lib/fixtures/location-path";

export interface AutocompleteDemoProps {
  label: string;
  options: readonly LocationOption[];
  isLoading?: boolean;
  error?: string | null;
}

/** The one interactive leaf on the demo route — everything else on the page is a Server Component. */
export function AutocompleteDemo({ label, options, isLoading, error }: AutocompleteDemoProps) {
  const [selection, setSelection] = useState<AutocompleteSelection | null>(null);

  return (
    <div>
      <LocationAutocomplete
        label={label}
        options={options}
        isLoading={isLoading}
        error={error}
        onSelect={setSelection}
      />
      <p className="mt-2 text-[11px] text-mid">
        {selection === null
          ? "Nothing selected yet."
          : selection.type === "existing"
            ? `Selected: ${selection.option.path}`
            : `Would create: "${selection.name}"`}
      </p>
    </div>
  );
}
