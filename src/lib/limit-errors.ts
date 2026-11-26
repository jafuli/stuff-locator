import { ITEM_LIMIT, LIMIT_ERROR_CODES, PLACE_LIMIT } from "@/lib/limits";

/**
 * Copy for the household limits (ADR 0015). Every string a person can see
 * at a limit lives here, so the PR can list them for sign-off and the
 * screens can't drift apart.
 */

/** Stash at the item cap — both the page that replaces the form and the inline save error. */
export const ITEM_LIMIT_MESSAGE = `Limit reached: your household holds ${String(ITEM_LIMIT)} things. Remove something you don't need to track anymore to make room.`;

/** The picker's note in place of "+ New place …" at the place cap. */
export const PLACE_LIMIT_PICKER_NOTE = `Limit reached: this household has ${String(PLACE_LIMIT)} places. Pick an existing one.`;

/** The picker's note in place of "+ New …" inside a place that is already at the depth limit. */
export const DEPTH_LIMIT_PICKER_NOTE = "Limit reached. Put it here, or pick a place higher up.";

/** Replaces "+ Add a place here" at the place cap. */
export const PLACE_LIMIT_ADD_NOTE = `Limit reached: this household has ${String(PLACE_LIMIT)} places. Remove an empty one to make room.`;

/** Replaces "+ Add a place here" inside a place that is already at the depth limit. */
export const DEPTH_LIMIT_ADD_NOTE = "Limit reached: this place can't hold more places. Add one higher up instead.";

/** The visible reason on a "Move into…" destination that would break the depth limit. */
export const MOVE_DESTINATION_LIMIT = "Limit reached";

/** A text field's maxLength was bypassed (only a client that skipped the form can get here). */
export const TOO_LONG_MESSAGE = "That's longer than this field allows. Shorten it and try again.";

/** Joining a household that already has its two people. */
export const HOUSEHOLD_FULL_MESSAGE =
  "This household already has two people in it, so this invite can't add anyone else.";

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

/** Which write failed, so the same code can read right in each place. */
export type RpcErrorContext = "stash" | "editItem" | "addPlace" | "renamePlace" | "movePlace";

export interface RpcErrorLike {
  code?: string;
  message: string;
}

/**
 * Turns a failed write into the copy a person sees. Limit codes (SL001–SL005)
 * and the two constraint codes the forms can hit are mapped; anything else
 * falls back to the database's own message, as the forms did before.
 *
 * `name` is the place name the write was about, for the messages that
 * quote it.
 */
export function friendlyRpcError(error: RpcErrorLike, context: RpcErrorContext, name = ""): string {
  switch (error.code) {
    case LIMIT_ERROR_CODES.itemLimit:
      return ITEM_LIMIT_MESSAGE;
    case LIMIT_ERROR_CODES.placeLimit:
      return context === "addPlace" ? PLACE_LIMIT_ADD_NOTE : PLACE_LIMIT_PICKER_NOTE;
    case LIMIT_ERROR_CODES.depthLimit:
      if (context === "addPlace") {
        return DEPTH_LIMIT_ADD_NOTE;
      }
      if (context === "movePlace") {
        return `Limit reached: “${name}” and the places inside it don't fit there. Pick a place higher up.`;
      }
      return DEPTH_LIMIT_PICKER_NOTE;
    case LIMIT_ERROR_CODES.householdFull:
      return HOUSEHOLD_FULL_MESSAGE;
    case UNIQUE_VIOLATION:
      if (context === "movePlace") {
        return `There's already a place with this name there. Rename “${name}” first, then move it.`;
      }
      if (context === "addPlace" || context === "renamePlace") {
        return `You already have “${name}” here.`;
      }
      return error.message;
    case CHECK_VIOLATION:
      return TOO_LONG_MESSAGE;
    default:
      if (context === "movePlace" && /own descendant|under itself/i.test(error.message)) {
        return `“${name}” can't go inside itself or a place within it.`;
      }
      return error.message;
  }
}
