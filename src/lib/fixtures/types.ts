// Originally MOCK DATA shapes for the src/components demo/catalog and the
// fixture arrays in this directory — NOT the real schema (see
// src/lib/database.types.ts for that). Home (src/app/page.tsx) now also
// reuses these same shapes as its mapping target for real Supabase rows:
// filterItems/StuffList/ItemCard/getBreadcrumbSegments all operate on this
// shape structurally, so real rows are adapted into it at the read
// boundary rather than duplicating a parallel set of real-data components.

/**
 * A storage location. Self-references via `parentId` so nesting can go as
 * deep as `garage → closet → toolbox → red box` — mirrors the real data
 * model described in CLAUDE.md (and, for Home, is populated from it).
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
