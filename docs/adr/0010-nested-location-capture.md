# 10. Nested location capture: a chip path builder, places born with the item

**Status:** Accepted

## Context

Locations are a self-referencing table of arbitrary depth, so
`Garage › Closet › Toolbox › Red box` is representable. What the app has
never settled is how a person *creates* one. Today Stash picks from existing
places, and a separate `/locations/new` form creates them on their own. That
gave two problems:

- **Duplicates.** Nothing stops "Garage" and "garage" being two places under
  the same parent, which is exactly the failure the full-path autocomplete
  exists to prevent (CLAUDE.md, *Location capture*).
- **Orphans and friction.** A place made through the form before the item is
  stashed is a place that may never get an item. And stashing something into a
  spot that doesn't exist yet means leaving Stash, creating it, and coming
  back.

The previous rule ("the UI defaults to shallow") also read as a limit on
depth. The real requirement is narrower: depth must be *possible*, never
*required*. One level is a complete answer.

## Decision

**One chip path builder everywhere an item gets a place** (Stash, item edit,
onboarding):

- Pick or create one level at a time. Each level becomes a chip and typing
  continues *inside* it: its own sub-places first, then everywhere.
- A solid chip is an existing place; a dashed chip is new and exists only in
  the form until the item is saved.
- Backspace on an empty field removes the last chip; tapping a chip goes back
  to that level.
- Full-path autocomplete stays for *finding* places. Picking a row turns it
  into chips, so you can keep going.
- Capture allows any depth but never requires more than one level.

**New places are saved atomically with the item**, never on their own. A
`stash_item` function takes the item and the chip path and, in one
transaction, resolves each level through an internal `ensure_location_path`
(find the existing place under that parent, or create it) and inserts the
item. `update_item` does the same when an edit moves the item somewhere new.
`ensure_location_path` is not granted to `authenticated`; only other functions
call it.

**Place names are unique per parent, ignoring case.** "Red box" under
`Toolbox` and "Red box" under `Kitchen` are different places; "Toolbox" and
"toolbox" under `Closet` are the same one and resolve to it.

**Browse is navigate + tidy up.** A ⋯ menu on a place's own page offers
Rename, Move into… (a pick-only picker) and Delete, and there is a name-only
"+ Add a place here". Rename, move and delete go through `rename_location`,
`move_container` and `delete_container`, and "+ Add a place here" through
`create_location` (ADR 0011 locks direct writes on `locations`).
**Delete is blocked until the place is empty**; a non-empty place shows what is inside and offers no destructive
button. Empty places are allowed and stay until someone deletes them.
`/locations/new` is removed.

## Consequences

- Duplicate places become impossible rather than merely discouraged: the
  uniqueness lives in the database, and `ensure_location_path` is the one
  creation path that matters for capture.
- Stash can never leave a half-made path behind. If the item insert fails,
  the new places roll back with it.
- Clearing a nested branch is bottom-up and a little tedious. That is accepted
  friction for v1; revisit only if it bites.
- Existing data may already contain case-variant duplicates under one
  parent, so the uniqueness migration has to deal with them (merge, or fail
  loudly) rather than assume a clean table. That is the job of the task that
  adds the constraint.
- `/locations/new`, its form and its e2e spec go away; the "add a place"
  shortcut in Browse replaces them for the cases the picker doesn't cover.

## Alternatives considered

- **A typed-separator path input** (`Garage > Closet > Red box`). Compact for
  power users, but it asks people to remember a syntax and to type separators
  on a phone keyboard, and a typo silently creates a new branch.
- **A create-place sheet** (a modal to name and parent a place). Reintroduces
  the leave-Stash-and-come-back detour and creates places on their own.
- **Cascading selects** (room, then container, then …). Slow to reach a deep
  spot and no good for "I just remember it's the red box". Full-path
  autocomplete already beat it for finding.
- **Cascade delete.** One tap removes a branch and everything in it, which is
  the wrong failure mode for a household's only record of where things are.
- **Move contents up on delete.** Quietly changes where every item in the
  branch lives, so the paths people remember stop being true.
- **Household-wide name uniqueness.** Wrong for real homes: "Top drawer" is a
  perfectly good name in several places.
- **Writing each new place the moment its chip is created.** Leaves orphan
  places behind whenever someone abandons the form, which is the problem this
  decision is trying to remove.
- **Auto-deleting empty places.** Surprising: a place made on purpose
  disappears when its last item is moved, and the person who made it never
  asked.
