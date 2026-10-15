// Pure state logic for LocationPathPicker (ADR 0010): which rows to offer,
// when "+ New" is allowed, and how a chip path turns into the arguments of
// `stash_item` / `update_item`. No React, no I/O — the component is a thin
// shell around these so the tricky rules are unit-testable.
import type { Location } from "@/lib/fixtures/types";

/**
 * One level of the path. A solid chip is a place that already exists; a
 * dashed chip is new and exists only in the form until the item is saved.
 * Once a chip is new, every chip after it is new too (a new place can't
 * contain an existing one).
 */
export type PathChip = { kind: "existing"; id: string; name: string } | { kind: "new"; name: string };

/** Mirrors the database's `normalize_place_name`: trim and collapse whitespace. */
export function normalizePlaceName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

function sameName(a: string, b: string): boolean {
  return normalizePlaceName(a).toLowerCase() === normalizePlaceName(b).toLowerCase();
}

function indexLocations(locations: readonly Location[]): Map<string, Location> {
  return new Map(locations.map((location) => [location.id, location]));
}

/** The root→leaf places for `locationId`, as solid chips. Cycle-safe. */
export function chipsForPlace(locationId: string, locations: readonly Location[]): PathChip[] {
  const byId = indexLocations(locations);
  const chips: PathChip[] = [];
  const visited = new Set<string>();

  let current = byId.get(locationId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chips.unshift({ kind: "existing", id: current.id, name: current.name });
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chips;
}

/** Full " › "-joined path of a place. */
export function pathForPlace(locationId: string, locations: readonly Location[]): string {
  return chipsForPlace(locationId, locations)
    .map((chip) => chip.name)
    .join(" › ");
}

export function chipsPath(chips: readonly PathChip[]): string {
  return chips.map((chip) => chip.name).join(" › ");
}

export function newChipCount(chips: readonly PathChip[]): number {
  return chips.filter((chip) => chip.kind === "new").length;
}

/** The deepest existing place in the path, or null at the top level. */
export function lastExistingId(chips: readonly PathChip[]): string | null {
  for (const chip of [...chips].reverse()) {
    if (chip.kind === "existing") {
      return chip.id;
    }
  }
  return null;
}

/**
 * The arguments for `stash_item` / `update_item` / `move_item`: the deepest
 * existing place, plus the names of the new levels hanging off it. `null`
 * when nothing has been chosen.
 */
export function resolvePath(chips: readonly PathChip[]): { locationId: string | null; newPath: string[] } | null {
  if (chips.length === 0) {
    return null;
  }
  return {
    locationId: lastExistingId(chips),
    newPath: chips.flatMap((chip) => (chip.kind === "new" ? [chip.name] : [])),
  };
}

/** Pick a row from the "inside" list: descend into an existing child. */
export function descend(chips: readonly PathChip[], place: Location): PathChip[] {
  return [...chips, { kind: "existing", id: place.id, name: place.name }];
}

/** Add a new level. Whitespace is normalized the way the database will. */
export function addNewLevel(chips: readonly PathChip[], rawName: string): PathChip[] {
  const name = normalizePlaceName(rawName);
  if (name === "") {
    return [...chips];
  }
  return [...chips, { kind: "new", name }];
}

/** Backspace on an empty field. */
export function popChip(chips: readonly PathChip[]): PathChip[] {
  return chips.slice(0, -1);
}

/** Tapping the chip at `index` goes back to that level (inclusive). */
export function truncateTo(chips: readonly PathChip[], index: number): PathChip[] {
  return chips.slice(0, index + 1);
}

export interface PickerRow {
  place: Location;
  path: string;
  /** Same name as what was typed, under the same parent: "already here". */
  isExactSibling: boolean;
}

export interface PickerRows {
  /** Children of the last existing chip (or the top level), matching the query. */
  inside: PickerRow[];
  /** Full-path substring matches elsewhere; picking one replaces all chips. */
  anywhere: PickerRow[];
  /** The "+ New …" row is offered only when this is non-null. */
  createName: string | null;
  /** Where a new level would be created, for the row's label. */
  createInside: string | null;
}

export interface RowsInput {
  locations: readonly Location[];
  chips: readonly PathChip[];
  query: string;
  /** No create row, no new chips: only existing places can be chosen. */
  pickOnly?: boolean;
  /** Places (and everything below them) that can't be chosen. */
  excludeIds?: readonly string[];
}

function byPath(a: PickerRow, b: PickerRow): number {
  return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
}

/**
 * Everything the dropdown shows for the current chips + query.
 *
 * The rules that matter:
 *  - "inside" is the last chip's own sub-places; once the last chip is new
 *    there is nothing inside it yet, so only "anywhere" and "+ New" remain.
 *  - "anywhere" never repeats a row already in "inside".
 *  - "+ New" appears only when no case-insensitive exact sibling exists —
 *    that sibling is listed (tagged "already here") instead. This is what
 *    makes typing an existing name, in any case, impossible to duplicate.
 */
export function buildRows({ locations, chips, query, pickOnly = false, excludeIds = [] }: RowsInput): PickerRows {
  const byId = indexLocations(locations);
  const excluded = new Set(excludeIds);

  const isExcluded = (id: string): boolean => {
    const seen = new Set<string>();
    let current = byId.get(id);
    while (current && !seen.has(current.id)) {
      if (excluded.has(current.id)) {
        return true;
      }
      seen.add(current.id);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return false;
  };

  const normalizedQuery = normalizePlaceName(query);
  const needle = normalizedQuery.toLowerCase();
  const lastChip = chips.at(-1);
  const parentId = lastExistingId(chips);
  const lastIsNew = lastChip?.kind === "new";

  const available = locations.filter((location) => !isExcluded(location.id));
  const toRow = (place: Location, isExactSibling: boolean): PickerRow => ({
    place,
    path: pathForPlace(place.id, locations),
    isExactSibling,
  });

  const inside: PickerRow[] = lastIsNew
    ? []
    : available
        .filter((place) => place.parentId === parentId)
        .filter((place) => needle === "" || place.name.toLowerCase().includes(needle))
        .map((place) => toRow(place, needle !== "" && sameName(place.name, normalizedQuery)))
        .sort(byPath);

  const insideIds = new Set(inside.map((row) => row.place.id));
  const anywhere: PickerRow[] =
    needle === ""
      ? []
      : available
          .filter((place) => !insideIds.has(place.id))
          .map((place) => toRow(place, false))
          .filter((row) => row.path.toLowerCase().includes(needle))
          .sort(byPath);

  const hasExactSibling = inside.some((row) => row.isExactSibling);
  const createName = pickOnly || normalizedQuery === "" || hasExactSibling ? null : normalizedQuery;

  return {
    inside,
    anywhere,
    createName,
    createInside: chips.length === 0 ? null : chipsPath(chips),
  };
}

/** Case-insensitive split of `text` around the first occurrence of `query`, for match highlighting. */
export function splitMatchSegments(text: string, query: string): { text: string; matched: boolean }[] {
  const trimmed = normalizePlaceName(query);
  if (trimmed === "") {
    return [{ text, matched: false }];
  }
  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index === -1) {
    return [{ text, matched: false }];
  }
  const segments: { text: string; matched: boolean }[] = [];
  if (index > 0) {
    segments.push({ text: text.slice(0, index), matched: false });
  }
  segments.push({ text: text.slice(index, index + trimmed.length), matched: true });
  if (index + trimmed.length < text.length) {
    segments.push({ text: text.slice(index + trimmed.length), matched: false });
  }
  return segments;
}
