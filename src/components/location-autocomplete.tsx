"use client";

import { useRef, useState } from "react";
import { useCombobox } from "downshift";
import { cn } from "@/lib/cn";
import type { LocationOption } from "@/lib/fixtures/location-path";

export type AutocompleteSelection =
  | { type: "existing"; option: LocationOption }
  | { type: "new"; name: string };

interface ComboItemOption {
  kind: "option";
  option: LocationOption;
}
interface ComboItemCreate {
  kind: "create";
  query: string;
}
type ComboItem = ComboItemOption | ComboItemCreate;

export interface LocationAutocompleteProps {
  /** Existing location full paths to match against. */
  options: readonly LocationOption[];
  onSelect: (selection: AutocompleteSelection) => void;
  label?: string;
  placeholder?: string;
  /** True while the caller's location list hasn't arrived yet. */
  isLoading?: boolean;
  /** Set when the caller's location list failed to load. Doesn't block typing a new place. */
  error?: string | null;
  /**
   * Id of an element describing a validation error for this field (the
   * caller's own `<p role="alert">`, e.g. "Choose a location for this
   * item."). Also drives `aria-invalid` on the input. This is a separate
   * concept from `error` above, which is about the *options list* failing to
   * load, not about what the caller chose from it.
   */
  describedBy?: string;
  /**
   * Fires with the raw input text on every change — both real typing and
   * the internal reset back to `""` right after a selection — so it always
   * mirrors this component's own `inputValue` faithfully. Optional: a
   * caller whose selection state always starts `null` (e.g. Stash's fresh
   * add-item form) has nothing stale to invalidate and can ignore it. A
   * caller that pre-fills an existing selection (e.g. an edit form) should
   * use this to clear that selection the moment the user starts typing
   * again — otherwise an edit abandoned mid-type (typed something, never
   * actually selected a row) can silently keep the old selection instead
   * of failing validation, since `onSelect` alone never fires for that.
   */
  onInputChange?: (value: string) => void;
}

/** Case-insensitive substring match over each option's full path. */
export function filterLocationOptions(options: readonly LocationOption[], query: string): LocationOption[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") {
    return [...options];
  }
  return options.filter((option) => option.path.toLowerCase().includes(trimmed));
}

export interface MatchSegment {
  text: string;
  matched: boolean;
}

/** Splits `text` around the first case-insensitive occurrence of `query`, for match highlighting. */
export function splitMatchSegments(text: string, query: string): MatchSegment[] {
  const trimmed = query.trim();
  if (trimmed === "") {
    return [{ text, matched: false }];
  }

  const index = text.toLowerCase().indexOf(trimmed.toLowerCase());
  if (index === -1) {
    return [{ text, matched: false }];
  }

  const segments: MatchSegment[] = [];
  if (index > 0) {
    segments.push({ text: text.slice(0, index), matched: false });
  }
  segments.push({ text: text.slice(index, index + trimmed.length), matched: true });
  if (index + trimmed.length < text.length) {
    segments.push({ text: text.slice(index + trimmed.length), matched: false });
  }
  return segments;
}

function itemToString(item: ComboItem | null): string {
  if (!item) {
    return "";
  }
  return item.kind === "create" ? `+ New place called "${item.query}"…` : item.option.path;
}

/**
 * Location picker built on downshift's useCombobox — the ARIA combobox
 * interaction contract is the one place in this component set worth
 * borrowing correct behavior for, rather than hand-rolling keyboard nav.
 * Matches over full paths (not a cascading picker), and always offers a
 * "+ New place called '<query>'…" row, reachable by keyboard exactly like a
 * real match, whenever the query is non-empty.
 */
export function LocationAutocomplete({
  options,
  onSelect,
  label = "Where?",
  placeholder,
  isLoading = false,
  error = null,
  describedBy,
  onInputChange,
}: LocationAutocompleteProps) {
  const [inputValue, setInputValue] = useState("");
  // Downshift's default reducer, when Enter/click selects an item, updates
  // its internal inputValue to that item's stringified form as part of the
  // SAME dispatch that fires onSelectedItemChange — which means
  // onInputValueChange still fires afterward with that non-empty value,
  // even though onSelectedItemChange (below) already forced inputValue
  // back to "". Without this guard, that trailing call would silently
  // resurrect the just-cleared text (and re-notify onInputChange with it),
  // undoing the "picker, not a tag input" reset a moment after it happened.
  const justSelectedRef = useRef(false);

  const trimmedQuery = inputValue.trim();
  const matches = isLoading ? [] : filterLocationOptions(options, inputValue);
  const createItem: ComboItem = { kind: "create", query: trimmedQuery };
  const items: ComboItem[] = isLoading
    ? []
    : [...matches.map((option): ComboItem => ({ kind: "option", option })), ...(trimmedQuery === "" ? [] : [createItem])];

  const { isOpen, getLabelProps, getMenuProps, getInputProps, highlightedIndex, getItemProps } = useCombobox<ComboItem>({
    items,
    inputValue,
    itemToString,
    onInputValueChange: ({ inputValue: nextValue }) => {
      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        setInputValue("");
        onInputChange?.("");
        return;
      }
      setInputValue(nextValue);
      onInputChange?.(nextValue);
    },
    // Controlled to null: this is a picker, not a tag input — a selection
    // fires onSelect and clears back to an empty field rather than
    // leaving a "chosen" chip behind.
    selectedItem: null,
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) {
        return;
      }
      justSelectedRef.current = true;
      if (selectedItem.kind === "create") {
        onSelect({ type: "new", name: selectedItem.query });
      } else {
        onSelect({ type: "existing", option: selectedItem.option });
      }
      setInputValue("");
      onInputChange?.("");
    },
  });

  const menuOpen = isOpen && !isLoading && items.length > 0;

  return (
    <div>
      <label
        {...getLabelProps()}
        className="mb-[3px] block text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase"
      >
        {label}
      </label>
      <div>
        <input
          {...getInputProps({
            "aria-describedby": describedBy,
            "aria-invalid": describedBy ? true : undefined,
          })}
          placeholder={placeholder}
          className={cn(
            "w-full rounded-[7px] border-[1.5px] px-[9px] py-[7px] text-[12.5px] text-ink outline-none",
            "placeholder:text-[#b0b0b0]",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
            inputValue.length > 0 ? "border-ink" : "border-line",
          )}
        />
        <ul
          {...getMenuProps()}
          className={cn(
            "-mt-[2px] rounded-b-[7px] border-[1.5px] border-t-0 border-ink bg-paper",
            menuOpen ? "block" : "hidden",
          )}
        >
          {menuOpen &&
            items.map((item, index) => {
              const key = item.kind === "create" ? "__create__" : item.option.id;
              return (
                <li
                  key={key}
                  {...getItemProps({ item, index })}
                  className={cn(
                    "border-b border-[#f0f0f0] px-[9px] py-[6px] text-[11px] last:border-b-0",
                    item.kind === "create"
                      ? "font-wire font-semibold text-note"
                      : "font-wire-mono tracking-[-0.01em] text-ink",
                    highlightedIndex === index && "bg-wash",
                  )}
                >
                  {item.kind === "create"
                    ? itemToString(item)
                    : splitMatchSegments(item.option.path, inputValue).map((segment, segmentIndex) =>
                        segment.matched ? (
                          <b key={segmentIndex} className="bg-[#ffe9a8] font-bold">
                            {segment.text}
                          </b>
                        ) : (
                          <span key={segmentIndex}>{segment.text}</span>
                        ),
                      )}
                </li>
              );
            })}
        </ul>
      </div>
      {isLoading ? (
        <p aria-live="polite" className="mt-1 text-[10.5px] text-mid">
          Loading places…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-1 text-[10.5px] text-mid">
          {error}
        </p>
      ) : null}
    </div>
  );
}
