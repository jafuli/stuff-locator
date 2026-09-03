// MOCK DATA — hand-authored for the src/components demo/catalog. This is NOT
// the real schema. The real data layer (Supabase-generated types, RLS,
// atomic RPCs) is Pair-session work — see CLAUDE.md and src/lib/database.types.ts.

/**
 * A storage location. Self-references via `parentId` so nesting can go as
 * deep as `garage → closet → toolbox → red box` — mirrors the real data
 * model described in CLAUDE.md, just without a database behind it yet.
 */
export interface Location {
  id: string;
  parentId: string | null;
  name: string;
}

/** A stashed item, belonging to exactly one location. */
export interface Item {
  id: string;
  locationId: string;
  name: string;
  detail?: string;
  addedBy?: string;
  addedAt?: Date;
  lastMovedBy?: string;
  lastMovedAt?: Date;
}
