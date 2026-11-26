"use client";

import { useStuffViews } from "@/components/stuff-views-shell";
import { countLine, type Noun } from "@/lib/limits";

export interface CountLineProps {
  /** How many of `noun` the household has: all its things, or all its places. */
  count: number;
  /** The household limit for them (src/lib/limits.ts). */
  max: number;
  noun: Noun;
}

/**
 * The quiet line directly above the Stuff list ("37 things") and the Browse
 * list ("14 places"). It counts the whole household, which is what a limit
 * applies to: "92 of 100 things" from 90%, "Limit reached: 100 of 100
 * things" at the cap (limitStatus — the same rule as every other counter).
 *
 * Hidden while a search is typed, because the list under it is then search
 * results, not the thing it counts; and hidden at zero, where the list's own
 * empty state already says so.
 */
export function CountLine({ count, max, noun }: CountLineProps) {
  const { query } = useStuffViews();
  if (count === 0 || query.trim() !== "") {
    return null;
  }
  return <p className="text-meta text-muted">{countLine(count, max, noun)}</p>;
}
