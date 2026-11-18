/**
 * One-off notices that ride along on a navigation as a query parameter:
 * "Saved" on an item's page after an edit, "Deleted <name>" on a place's
 * Browse page after deleting an item from it. The page reads the parameter
 * (server-side, from `searchParams`), and FlashNotice removes it from the
 * address bar once shown, so a reload or a later Back doesn't repeat it.
 *
 * A query parameter rather than sessionStorage or a cookie: the edit form
 * navigates with `router.replace`, and the destination is a Server Component
 * that can read the parameter in the same request. Nothing has to be cleaned
 * up if the notice is never shown.
 */

export const SAVED_PARAM = "saved";
export const DELETED_PARAM = "deleted";

/** Longest item name echoed back. Item names are short; this caps a hand-edited URL. */
const MAX_NAME_LENGTH = 120;

/** The item's own page, announcing that the edit was saved. */
export function itemSavedHref(itemId: string): string {
  return `/items/${itemId}?${SAVED_PARAM}=1`;
}

/** The Browse page of the place a just-deleted item was in, naming it. */
export function browseDeletedHref(locationId: string, itemName: string): string {
  return `/browse/${locationId}?${DELETED_PARAM}=${encodeURIComponent(itemName)}`;
}

type SearchParamValue = string | string[] | undefined;

function firstValue(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** "Saved" when the item page was reached from a successful edit, otherwise null. */
export function savedNotice(searchParams: Record<string, SearchParamValue>): string | null {
  return firstValue(searchParams[SAVED_PARAM]) === undefined ? null : "Saved";
}

/** "Deleted <name>" when a place page was reached from deleting an item in it, otherwise null. */
export function deletedNotice(searchParams: Record<string, SearchParamValue>): string | null {
  const name = firstValue(searchParams[DELETED_PARAM])?.trim();
  if (!name) {
    return null;
  }
  const shown = name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH)}…` : name;
  return `Deleted ${shown}`;
}

/**
 * The current URL without the notice parameters (any other query, and the
 * hash, are kept). Null when there is nothing to remove.
 */
export function urlWithoutNotice(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(SAVED_PARAM) && !url.searchParams.has(DELETED_PARAM)) {
    return null;
  }
  url.searchParams.delete(SAVED_PARAM);
  url.searchParams.delete(DELETED_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}
