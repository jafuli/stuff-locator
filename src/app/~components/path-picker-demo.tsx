"use client";

import { useState } from "react";
import { LocationPathPicker, type PathChip } from "@/components/location-path-picker";
import type { Location } from "@/lib/fixtures/types";
import { chipsPath, newChipCount } from "@/lib/location-path-picker";

export interface PathPickerDemoProps {
  label: string;
  locations: readonly Location[];
  pickOnly?: boolean;
  excludeIds?: readonly string[];
  placeholder?: string;
}

/** The one interactive leaf on the demo route — everything else on the page is a Server Component. */
export function PathPickerDemo({ label, locations, pickOnly, excludeIds, placeholder }: PathPickerDemoProps) {
  const [chips, setChips] = useState<PathChip[]>([]);

  const newCount = newChipCount(chips);
  return (
    <div>
      <LocationPathPicker
        label={label}
        locations={locations}
        value={chips}
        onChange={setChips}
        pickOnly={pickOnly}
        excludeIds={excludeIds}
        placeholder={placeholder}
      />
      <p className="mt-2 text-[11px] text-mid">
        {chips.length === 0
          ? "Nothing chosen yet."
          : `Chosen: ${chipsPath(chips)}${newCount > 0 ? ` (${String(newCount)} new)` : ""}`}
      </p>
    </div>
  );
}
