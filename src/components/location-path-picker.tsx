"use client";

import { useId, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { useCombobox } from "downshift";
import { CharacterCounter, counterDescribedBy } from "@/components/ui/character-counter";
import { cn } from "@/lib/cn";
import type { Location } from "@/lib/fixtures/types";
import { DEPTH_LIMIT_PICKER_NOTE, MOVE_DESTINATION_LIMIT, PLACE_LIMIT_PICKER_NOTE } from "@/lib/limit-errors";
import { TEXT_LIMITS } from "@/lib/limits";
import {
  addNewLevel,
  buildRows,
  chipsForPlace,
  chipsPath,
  descend,
  newChipCount,
  popChip,
  splitMatchSteps,
  truncateTo,
  type PathChip,
  type PickerRow,
} from "@/lib/location-path-picker";

export type { PathChip };

interface InsideItem {
  kind: "inside";
  row: PickerRow;
}
interface AnywhereItem {
  kind: "anywhere";
  row: PickerRow;
}
interface CreateItem {
  kind: "create";
  name: string;
}
type ComboItem = InsideItem | AnywhereItem | CreateItem;

export interface LocationPathPickerProps {
  /** Every place in the household. */
  locations: readonly Location[];
  /** The chosen path, root first. Controlled. */
  value: readonly PathChip[];
  onChange: (chips: PathChip[]) => void;
  label?: string;
  placeholder?: string;
  /** Disables the whole control, e.g. while a parent form's submit is in flight. */
  disabled?: boolean;
  /** Id of the element describing a validation error; also drives `aria-invalid`. */
  describedBy?: string;
  /** Only existing places can be chosen: no "+ New" row, no dashed chips. */
  pickOnly?: boolean;
  /** Places (and everything below them) that can't be chosen. */
  excludeIds?: readonly string[];
  /**
   * Places that are listed but can't be chosen, greyed with "Limit reached"
   * — "Move into…" destinations that would break the depth limit.
   */
  disabledIds?: readonly string[];
  /**
   * Fires with the raw text on every change, so a form can tell "typed but
   * never turned into a chip" apart from a real selection.
   */
  onInputChange?: (value: string) => void;
  /** The text field, for a form that moves focus to it (e.g. after a failed submit). */
  inputRef?: Ref<HTMLInputElement>;
}

const SECTION_CLASS = "border-b border-divider last:border-b-0";
const HEADER_CLASS = "px-4 pt-3 pb-1 text-section-label text-muted";

/**
 * A place or a full path in a menu row, with the typed text underlined. It
 * wraps the way PathTrail does: each step (a name and the "›" after it) is
 * one flex item, so a step that fits moves to the next line whole, and only
 * a step wider than the row breaks inside (at a space, or anywhere for one
 * unbroken word). Nothing is clipped by the menu's overflow-hidden.
 */
function MatchedPath({ path, query }: { path: string; query: string }): ReactNode {
  const steps = splitMatchSteps(path, query);
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
      {steps.map((pieces, stepIndex) => (
        <span key={stepIndex} className="inline-flex min-w-0 items-center gap-x-1.5">
          <span className="min-w-0 wrap-anywhere">
            {pieces.map((piece, index) =>
              piece.matched ? (
                <b key={index} className="font-medium underline decoration-2 underline-offset-2">
                  {piece.text}
                </b>
              ) : (
                <span key={index}>{piece.text}</span>
              ),
            )}
          </span>
          {stepIndex < steps.length - 1 ? (
            <span aria-hidden="true" className="shrink-0 text-faint">
              {" › "}
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

/**
 * The one control for choosing where an item goes (ADR 0010): a chip path
 * builder on downshift's combobox. Picking a place turns it into a chip and
 * typing continues *inside* it; "+ New" adds a dashed chip that is only
 * written when the form is submitted, atomically with the item.
 *
 * Controlled: the caller owns the chips and turns them into function
 * arguments with `resolvePath` (src/lib/location-path-picker.ts).
 */
export function LocationPathPicker({
  locations,
  value,
  onChange,
  label = "Location",
  placeholder,
  disabled = false,
  describedBy,
  pickOnly = false,
  excludeIds,
  disabledIds,
  onInputChange,
  inputRef,
}: LocationPathPickerProps) {
  const [inputValue, setInputValue] = useState("");
  // Explicit so a chip tap can return focus to the field.
  const inputId = useId();
  const counterId = `${inputId}-counter`;
  const limitNoteId = `${inputId}-limit`;
  const [announcement, setAnnouncement] = useState("");
  const rows = buildRows({ locations, chips: value, query: inputValue, pickOnly, excludeIds, disabledIds });
  const limitNote =
    rows.createBlocked === "depthLimit"
      ? DEPTH_LIMIT_PICKER_NOTE
      : rows.createBlocked === "placeLimit"
        ? PLACE_LIMIT_PICKER_NOTE
        : null;
  const insideItems: ComboItem[] = rows.inside.map((row) => ({ kind: "inside", row }));
  const anywhereItems: ComboItem[] = rows.anywhere.map((row) => ({ kind: "anywhere", row }));
  const createItems: ComboItem[] = rows.createName === null ? [] : [{ kind: "create", name: rows.createName }];
  // One flat list for downshift; the sections below render slices of it, so
  // an item's index here is its option index in the listbox.
  const items: ComboItem[] = [...insideItems, ...anywhereItems, ...createItems];
  const anywhereOffset = insideItems.length;
  const createOffset = anywhereOffset + anywhereItems.length;

  const lastChip = value.at(-1);
  const insideLabel =
    lastChip === undefined || value.every((chip) => chip.kind === "new") ? "Top level" : `Inside ${lastChip.name}`;
  const pathLabel = value.length === 0 ? "none chosen" : chipsPath(value);
  const newCount = newChipCount(value);

  function setText(next: string) {
    setInputValue(next);
    onInputChange?.(next);
  }

  function commit(chips: PathChip[], message: string) {
    onChange(chips);
    setAnnouncement(message);
    setText("");
  }

  function handleSelect(item: ComboItem) {
    if (item.kind === "create") {
      const next = addNewLevel(value, item.name);
      commit(next, `New place ${item.name} added. Location: ${chipsPath(next)}`);
    } else if (item.kind === "inside") {
      const next = descend(value, item.row.place);
      commit(next, `Added ${item.row.place.name}. Location: ${chipsPath(next)}`);
    } else {
      const next = chipsForPlace(item.row.place.id, locations);
      commit(next, `Location: ${chipsPath(next)}`);
    }
  }

  const { isOpen, closeMenu, getLabelProps, getMenuProps, getInputProps, highlightedIndex, getItemProps } =
    useCombobox<ComboItem>({
      items,
      inputId,
      inputValue,
      // A pick becomes a chip and clears the field, so an item never stands
      // for text in the input. Returning "" is also what stops downshift from
      // writing the picked text back into the field after we cleared it.
      itemToString: () => "",
      // The first option is highlighted whenever the list is open, so typing
      // a name and pressing Enter picks it: the existing place when one
      // matches first, otherwise "+ New …". Arrows still move the highlight.
      defaultHighlightedIndex: 0,
      // A greyed "Move into…" destination is skipped by the arrows and can't
      // be picked; the create row is never disabled (it is replaced by a note).
      isItemDisabled: (item) => item.kind !== "create" && item.row.disabled,
      onInputValueChange: ({ inputValue: nextValue }) => {
        setText(nextValue);
      },
      // Controlled to null: a pick becomes a chip and clears the field, it is
      // never left as "the selected item".
      selectedItem: null,
      onSelectedItemChange: ({ selectedItem }) => {
        if (selectedItem) {
          handleSelect(selectedItem);
        }
      },
    });

  const menuOpen = isOpen && !disabled && items.length > 0;

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter on a highlighted row is handled here, synchronously, rather than
    // through downshift's onSelectedItemChange — that callback runs in an
    // effect after the render, so a fast Tab/Enter right after the pick could
    // submit the form with the chips still unset. React flushes this update at
    // the end of the keydown, before the next key event is dispatched.
    if (event.key === "Enter") {
      const highlighted = isOpen && highlightedIndex >= 0 ? items.at(highlightedIndex) : undefined;
      const item =
        highlighted && (highlighted.kind === "create" || !highlighted.row.disabled) ? highlighted : undefined;
      // Enter in this field only ever picks. With nothing to pick (an empty
      // field, no matches) it does nothing, rather than falling through to
      // submit the surrounding form by accident.
      event.preventDefault();
      Object.assign(event.nativeEvent, { preventDownshiftDefault: true });
      if (item) {
        handleSelect(item);
        closeMenu();
      }
      return;
    }

    if (event.key === "Backspace" && inputValue === "" && value.length > 0) {
      event.preventDefault();
      const removed = value.at(-1);
      const next = popChip(value);
      onChange(next);
      setAnnouncement(
        `Removed ${removed?.name ?? "last level"}. Location: ${next.length === 0 ? "none chosen" : chipsPath(next)}`,
      );
    }
  }

  function renderOption(item: ComboItem, index: number) {
    const isHighlighted = highlightedIndex === index;
    // flex-wrap: a side note ("top level", "inside …", "already here") drops
    // under the name when both don't fit on one line.
    const base = "flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2";
    if (item.kind === "create") {
      const label = rows.createInside === null ? `+ New place “${item.name}”` : `+ New “${item.name}”`;
      const where = rows.createInside === null ? "top level" : `inside ${rows.createInside}`;
      // WCAG 2.5.3 (Label in Name): the accessible name must contain the
      // visible words, in order, so a voice-control user can say what they
      // see. So the name starts with exactly the visible text and only adds
      // context after it. The "+" is a symbol axe ignores when comparing.
      const accessibleName =
        rows.createInside === null ? `New place “${item.name}”, top level` : `New “${item.name}” ${where}, new place`;
      return (
        <li
          key="__create__"
          {...getItemProps({ item, index })}
          aria-label={accessibleName}
          className={cn(base, "text-body font-medium text-ink", isHighlighted && "bg-divider")}
        >
          {/* The space keeps the two spans' words apart in the computed
              visible text; a flex container doesn't render it. */}
          <span className="min-w-0 wrap-anywhere">{label}</span>{" "}
          {/* "inside ‹place›" can be long too, so it may wrap as well. */}
          <span className="min-w-0 text-meta font-normal text-muted wrap-anywhere">{where}</span>
        </li>
      );
    }
    const { row } = item;
    // Inside rows show just the place's own name (its parent is the last
    // chip); anywhere rows show the full path.
    const text = item.kind === "inside" ? row.place.name : row.path;
    const ariaLabel = row.disabled
      ? `${row.path}, ${MOVE_DESTINATION_LIMIT.toLowerCase()}`
      : row.isExactSibling
        ? `${row.path}, already here`
        : row.path;
    return (
      <li
        key={row.place.id}
        {...getItemProps({ item, index })}
        aria-label={ariaLabel}
        className={cn(
          base,
          "text-path",
          row.disabled ? "cursor-not-allowed text-muted" : "text-ink",
          isHighlighted && "bg-divider",
        )}
      >
        <MatchedPath path={text} query={inputValue} />
        {/* Visible reason, also inside the accessible name above; the
            option itself is aria-disabled (downshift's isItemDisabled). */}
        {row.disabled ? (
          <>
            {" "}
            <span className="shrink-0 text-meta text-muted">{MOVE_DESTINATION_LIMIT}</span>
          </>
        ) : null}
        {/* The space keeps "Box" and "already here" apart in the visible
            text, so it stays inside the accessible name (WCAG 2.5.3). */}
        {row.isExactSibling ? (
          <>
            {" "}
            <span className="shrink-0 text-meta text-muted">already here</span>
          </>
        ) : null}
      </li>
    );
  }

  return (
    <div>
      <label {...getLabelProps()} className="mb-1 block text-meta text-muted">
        {label}
      </label>

      {/* The chips and the input share one bordered box so it reads as a
          single control; the group's label announces the current path. */}
      <div
        className={cn(
          "flex min-h-control-height flex-wrap items-center gap-1.5 rounded-control border bg-surface px-3 py-1.5 shadow-control",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus",
          value.length > 0 || inputValue.length > 0 ? "border-border-strong" : "border-border-control",
          disabled && "opacity-60",
        )}
        role="group"
        aria-label={`Location: ${pathLabel}`}
      >
        {value.map((chip, index) => (
          <span key={`${chip.kind}-${String(index)}-${chip.name}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 ? (
              <span aria-hidden="true" className="shrink-0 text-path text-faint">
                ›
              </span>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const next = truncateTo(value, index);
                onChange(next);
                setAnnouncement(`Location: ${chipsPath(next)}`);
                document.getElementById(inputId)?.focus();
              }}
              aria-label={`${chip.name}${chip.kind === "new" ? ", new place" : ""}. Go back to this level`}
              className={cn(
                // Chips speak the path language: uppercase mono. The last chip,
                // when that place already exists, is on tape (it is the
                // location so far); a chip that doesn't exist yet is dashed
                // and untaped until the item is saved — the tape prints in
                // then (see StashForm's success panel).
                "inline-flex min-h-target-min min-w-target-min items-center justify-center rounded-tape px-2 text-path wrap-anywhere",
                "focus-ring",
                chip.kind === "new"
                  ? "border border-dashed border-border-strong bg-transparent text-ink"
                  : index === value.length - 1
                    ? "bg-tape text-on-tape shadow-tape"
                    : "border border-hairline bg-paper text-muted",
              )}
            >
              {chip.name}
            </button>
          </span>
        ))}
        <input
          {...getInputProps({
            ref: inputRef,
            "aria-describedby":
              [
                describedBy,
                limitNote === null ? null : limitNoteId,
                pickOnly ? null : counterDescribedBy(counterId, inputValue, TEXT_LIMITS.placeName),
              ]
                .filter(Boolean)
                .join(" ") || undefined,
            "aria-invalid": describedBy ? true : undefined,
            disabled,
            onKeyDown: handleKeyDown,
            // A new place's name is held to the place-name limit as it is
            // typed; a pick-only picker only searches, so it isn't.
            maxLength: pickOnly ? undefined : TEXT_LIMITS.placeName,
          })}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="min-h-11 min-w-[7ch] flex-1 bg-transparent px-1 text-body text-ink outline-none placeholder:text-muted disabled:opacity-60"
        />
      </div>

      {pickOnly ? null : <CharacterCounter id={counterId} value={inputValue} max={TEXT_LIMITS.placeName} />}

      <ul
        {...getMenuProps()}
        className={cn(
          "mt-2 overflow-hidden rounded-panel border border-hairline bg-surface shadow-float",
          menuOpen ? "block" : "hidden",
        )}
      >
        {menuOpen ? (
          <>
            {insideItems.length > 0 ? (
              <li role="presentation" className={SECTION_CLASS}>
                <ul role="group" aria-label={insideLabel}>
                  <li role="presentation" aria-hidden="true" className={HEADER_CLASS}>
                    {insideLabel}
                  </li>
                  {insideItems.map((item, offset) => renderOption(item, offset))}
                </ul>
              </li>
            ) : null}
            {anywhereItems.length > 0 ? (
              <li role="presentation" className={SECTION_CLASS}>
                <ul role="group" aria-label="Matches anywhere">
                  <li role="presentation" aria-hidden="true" className={HEADER_CLASS}>
                    Matches anywhere
                  </li>
                  {anywhereItems.map((item, offset) => renderOption(item, anywhereOffset + offset))}
                </ul>
              </li>
            ) : null}
            {createItems.length > 0 ? (
              <li role="presentation" className={SECTION_CLASS}>
                <ul role="group" aria-label="Create">
                  {createItems.map((item, offset) => renderOption(item, createOffset + offset))}
                </ul>
              </li>
            ) : null}
          </>
        ) : null}
      </ul>

      {value.length > 0 ? (
        <p className="mt-1 text-meta text-muted wrap-anywhere">
          Goes in <b className="font-medium text-ink">{chipsPath(value)}</b>
          {newCount > 0 ? ` · ${String(newCount)} new place${newCount === 1 ? "" : "s"}` : ""}
        </p>
      ) : null}

      {/* Chip additions and removals are not focus changes, so announce them. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Where "+ New …" would be, at a limit: a note, not an option, so it
          sits outside the listbox, under "Goes in …" (which it refers to:
          "Put it here"). Existing places above stay pickable. Always mounted
          and polite, so it is announced once when it fills in. */}
      <p
        id={limitNoteId}
        aria-live="polite"
        className={cn("text-meta text-muted", limitNote === null ? "sr-only" : "mt-2")}
      >
        {limitNote}
      </p>
    </div>
  );
}
