import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { firstNameOf } from "@/lib/display-name";

/**
 * What the app needs to call a household something. Nothing here is a
 * generated name: `name` is only ever what someone typed (null until anyone
 * does), and the owner's display name is read fresh, so renaming yourself
 * renames "your" household everywhere at once.
 */
export interface HouseholdIdentity {
  /** The name someone chose for the household; null until anyone does. */
  readonly name: string | null;
  /** The owner's current display name; null if it can't be read. */
  readonly ownerDisplayName: string | null;
}

/**
 * The household's title: its chosen name, else "<owner's first name>'s
 * household". Null when neither is known (the owner's profile can't be
 * read), so each screen picks its own wording for that case ("Your
 * household" in the sheet, "the household" mid-sentence on the join page).
 * Pure, so it is testable without a database.
 */
export function householdTitle({ name, ownerDisplayName }: HouseholdIdentity): string | null {
  if (name !== null && name.trim() !== "") {
    return name;
  }
  const firstName = firstNameOf(ownerDisplayName);
  return firstName === undefined ? null : `${firstName}'s household`;
}

/**
 * Reads a household's identity through the caller's own RLS-scoped session:
 * the household row with its members, then the owner's profile (members
 * can read each other's). Two requests, because profiles and
 * household_members only meet through auth.users, which PostgREST can't
 * embed across. Without `householdId` it reads the caller's household (a
 * user belongs to at most one, ADR 0015).
 *
 * Null when the household itself can't be read.
 */
export async function readHouseholdIdentity(
  supabase: SupabaseClient<Database>,
  householdId?: string,
): Promise<HouseholdIdentity | null> {
  const select = supabase.from("households").select("name, household_members(user_id, role)");
  const { data: household } = await (householdId === undefined ? select : select.eq("id", householdId))
    .limit(1)
    .maybeSingle();
  if (!household) {
    return null;
  }

  const owner = household.household_members.find((member) => member.role === "owner");
  if (owner === undefined) {
    return { name: household.name, ownerDisplayName: null };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", owner.user_id)
    .maybeSingle();
  return { name: household.name, ownerDisplayName: profile?.display_name ?? null };
}
