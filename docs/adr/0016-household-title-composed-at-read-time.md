# 16. A household's name is chosen; its default title is composed when shown

**Status:** Accepted (2026-11-26). Amends ADR 0004 and ADR 0015.

## Context

`households.name` was `NOT NULL` from the first schema, and
`create_household` required a non-blank name. So the sign-up bootstrap had
to invent one: the founder's email handle at first, then "‹First›'s
household" once people gave their name at sign-up.

Both were a copy of the founder's display name taken on the day the
household was created. Two problems followed:

- **The copy goes stale.** Everything else in the app resolves people's
  names when a page renders (Stuff, item detail, Activity). After the owner
  renamed themselves, every screen showed the new name except the
  household, which kept the old one for good.
- **UI copy ended up in data.** "'s household" is wording. Storing it meant a
  50-character first name pushed the stored title past the 50-character
  household-name CHECK. That needed clamping, and then a truncation rule, to
  fix a value that never needed to be stored.

## Decision

- **`households.name` is nullable and means "the name someone chose".** It
  is null until a person types one (the Settings rename, later).
  `create_household`'s name is optional: leaving it out creates an unnamed
  household, and a name that is given must still be non-blank. The
  bootstrap passes none.
- **The title is composed when it is shown** by `householdTitle` in
  `src/lib/household-title.ts`:
  - the chosen name, if there is one;
  - otherwise "‹owner's first name›'s household", where the owner is the
    `role = 'owner'` member and the name comes from their current profile;
  - otherwise each screen's own fallback ("Your household" in the sheet,
    "the household" on the join page).
- **The household button's initial is always the owner's,** never taken from
  a chosen household name. It stays one letter, so it never trips axe's
  label-content-name-mismatch rule.
- **Existing names were all cleared.** No screen ever let anyone choose a
  household name, so every stored name was generated. Matching them against
  the owner's *current* name would have missed exactly the stale ones.
- **The 50-character limit (ADR 0015) stays,** and now applies only to names
  people type.

## Consequences

- Renaming yourself renames your household's title everywhere, at once.
- Reading the title takes two requests instead of one: the household with
  its members, then the owner's profile. PostgREST can't embed across
  `profiles` and `household_members`, which only meet through `auth.users`.
- If the owner's profile can't be read (for example, after the owner deletes
  their account), the title falls back. The account-deletion work decides
  what a household without its owner is called.
- Long titles wrap anywhere (`overflow-wrap: anywhere` on dialog titles), so
  a 50-character one-word name never scrolls a phone screen sideways.
