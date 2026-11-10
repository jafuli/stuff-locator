// When a query is worth spending an embedding on. Plain constants, kept out of
// the hook module so pure code (and tests that mock the hook) can use them.

/** Wait this long after the last keystroke before spending an embedding on it. */
export const QUERY_DEBOUNCE_MS = 150;

/**
 * Below this a query is a fragment ("pa", "pas"), and the embedding of a
 * fragment is noise. Those queries are ranked lexically only.
 */
export const MIN_SEMANTIC_QUERY_LENGTH = 3;
