"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { useCombobox } from "downshift";
import { cn } from "@/lib/cn";
import type { Location } from "@/lib/fixtures/types";
import {
  addNewLevel,
  buildRows,
  chipsForPlace,
  chipsPath,
  descend,
  newChipCount,
  popChip,
  splitMatchSegments,
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
   * Fires with the raw text on every change, so a form can tell "typed but
   * never turned into a chip" apart from a real selection.
   */
  onInputChange?: (value: string) => void;
}

const SECTION_CLASS = "border-b border-divider last:border-b-0";
const HEADER_CLASS = "px-4 pt-3 pb-1 text-section-label text-muted";

function MatchedPath({ path, query }: { path: string; query: string }): ReactNode {
  return splitMatchSegments(path, query).map((segment, index) =>
    segment.matched ? (
      <b key={index} className="font-medium underline decoration-2 underline-offset-2">
        {segment.text}
      </b>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
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
  onInputChange,
}: LocationPathPickerProps) {
  const [inputValue, setInputValue] = useState("");
  // Explicit so a chip tap can return focus to the field.
  const inputId = useId();
  const [announcement, setAnnouncement] = useState("");
  const rows = buildRows({ locations, chips: value, query: inputValue, pickOnly, excludeIds });
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
    if (event.key === "Enter" && isOpen && highlightedIndex >= 0) {
      const item = items.at(highlightedIndex);
      if (item) {
        event.preventDefault();
        Object.assign(event.nativeEvent, { preventDownshiftDefault: true });
        handleSelect(item);
        closeMenu();
        return;
      }
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
    const base = "flex min-h-12 items-center justify-between gap-3 px-4 py-2";
    if (item.kind === "create") {
      const where = rows.createInside === null ? "at the top level" : `inside ${rows.createInside}`;
      return (
        <li
          key="__create__"
          {...getItemProps({ item, index })}
          aria-label={`New place '${item.name}' ${where}`}
          className={cn(base, "text-body font-medium text-ink", isHighlighted && "bg-divider")}
        >
          <span>{rows.createInside === null ? `+ New place “${item.name}”` : `+ New “${item.name}”`}</span>
          <span className="shrink-0 text-meta font-normal text-muted">
            {rows.createInside === null ? "top level" : `inside ${rows.createInside}`}
          </span>
        </li>
      );
    }
    const { row } = item;
    // Inside rows show just the place's own name (its parent is the last
    // chip); anywhere rows show the full path.
    const text = item.kind === "inside" ? row.place.name : row.path;
    return (
      <li
        key={row.place.id}
        {...getItemProps({ item, index })}
        aria-label={row.isExactSibling ? `${row.path}, already here` : row.path}
        className={cn(base, "text-path text-ink", isHighlighted && "bg-divider")}
      >
        <span>
          <MatchedPath path={text} query={inputValue} />
        </span>
        {row.isExactSibling ? <span className="shrink-0 text-meta text-muted">already here</span> : null}
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
          <span key={`${chip.kind}-${String(index)}-${chip.name}`} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span aria-hidden="true" className="text-path text-faint">
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
                "inline-flex min-h-target-min min-w-target-min items-center justify-center rounded-tape px-2 text-path break-words outline-none",
                "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
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
            "aria-describedby": describedBy,
            "aria-invalid": describedBy ? true : undefined,
            disabled,
            onKeyDown: handleKeyDown,
          })}
          placeholder={value.length === 0 ? placeholder : undefined}
          className="min-h-11 min-w-[7ch] flex-1 bg-transparent px-1 text-body text-ink outline-none placeholder:text-muted disabled:opacity-60"
        />
      </div>

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
        <p className="mt-1 text-meta text-muted">
          Goes in <b className="font-medium text-ink">{chipsPath(value)}</b>
          {newCount > 0 ? ` · ${String(newCount)} new place${newCount === 1 ? "" : "s"}` : ""}
        </p>
      ) : null}

      {/* Chip additions and removals are not focus changes, so announce them. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
