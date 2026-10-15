"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SubmitEvent } from "react";
import { LocationPathPicker } from "@/components/location-path-picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import type { Location } from "@/lib/fixtures/types";
import { lastExistingId, type PathChip } from "@/lib/location-path-picker";
import { validatePlaceName } from "@/lib/location-validation";
import { createClient } from "@/server/db/client";

export interface PlaceManagerProps {
  place: { id: string; name: string };
  /** Where to go after the place is deleted: its parent, or /browse. */
  afterDeleteHref: string;
  /** Whether the place sits inside another (hides "Top level" in Move). */
  hasParent: boolean;
  /** Every place in the household, for the Move picker. */
  locations: readonly Location[];
  /** Items anywhere inside this place, and its direct sub-places. */
  itemCount: number;
  placeCount: number;
}

const UNIQUE_VIOLATION = "23505";

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** "2 items and 1 place", "2 items", "1 place". */
export function describeContents(itemCount: number, placeCount: number): string {
  const parts = [
    ...(itemCount > 0 ? [plural(itemCount, "item", "items")] : []),
    ...(placeCount > 0 ? [plural(placeCount, "place", "places")] : []),
  ];
  return parts.join(" and ");
}

type DialogKind = "move" | "delete" | null;

/**
 * The place's own heading plus everything you can do to it (ADR 0010):
 * a ⋯ menu with Rename, Move into… and Delete. Delete is blocked until the
 * place is empty; the menu item stays visible and opens an explanation
 * rather than being disabled without a reason.
 *
 * Every change is a function call (`rename_location`, `move_container`,
 * `delete_container`), each of which records its activity event.
 */
export function PlaceManager({
  place,
  afterDeleteHref,
  hasParent,
  locations,
  itemCount,
  placeCount,
}: PlaceManagerProps) {
  const router = useRouter();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(place.name);
  const [renameError, setRenameError] = useState<string | undefined>();
  const [isRenaming, setIsRenaming] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const cancelRenameRef = useRef<() => void>(() => undefined);

  // Opening the menu moves focus to its first item; closing returns it.
  useEffect(() => {
    if (menuOpen) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renaming]);

  // Escape cancels a rename, wherever focus is inside the form.
  useEffect(() => {
    if (!renaming) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelRenameRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [renaming]);

  // A press outside the menu closes it (without stealing focus).
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (target instanceof Node && !menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [menuOpen]);

  function closeMenu(returnFocus: boolean) {
    setMenuOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.findIndex((item) => item === document.activeElement);

    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items.at((index + 1) % items.length)?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items.at((index - 1 + items.length) % items.length)?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items.at(0)?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    } else if (event.key === "Tab") {
      closeMenu(false);
    }
  }

  // The menu item that opened a dialog is gone by the time it closes, so the
  // dialog's own focus-return would land on <body>; hand focus to the ⋯ button.
  function closeDialog() {
    setDialog(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function startRename() {
    setMenuOpen(false);
    setDraft(place.name);
    setRenameError(undefined);
    setRenaming(true);
  }

  function cancelRename() {
    setRenaming(false);
    setRenameError(undefined);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    cancelRenameRef.current = cancelRename;
  });

  async function submitRename(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validatePlaceName(draft);
    if (validation) {
      setRenameError(validation);
      return;
    }
    const trimmed = draft.trim().replace(/\s+/g, " ");
    if (trimmed === place.name) {
      cancelRename();
      return;
    }

    setRenameError(undefined);
    setIsRenaming(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("rename_location", { p_location_id: place.id, p_name: trimmed });
    setIsRenaming(false);

    if (error) {
      setRenameError(error.code === UNIQUE_VIOLATION ? `You already have “${trimmed}” here.` : error.message);
      return;
    }
    setRenaming(false);
    router.refresh();
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <form
            noValidate
            onSubmit={(event) => void submitRename(event)}
            className="flex min-w-0 flex-1 flex-col gap-2"
          >
            <h1 className="text-[16px] font-semibold text-ink">
              <label htmlFor="rename-place" className="sr-only">
                Place name
              </label>
              <input
                ref={renameInputRef}
                id="rename-place"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                }}
                disabled={isRenaming}
                aria-invalid={renameError ? true : undefined}
                aria-describedby="rename-place-hint"
                className="w-full rounded-[7px] border-[1.5px] border-ink px-[9px] py-[6px] text-[16px] font-semibold text-ink outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              />
            </h1>
            <p id="rename-place-hint" className="text-[10.5px] text-mid">
              Enter to save · Esc to cancel
            </p>
            {renameError ? (
              <p role="alert" className="text-[10.5px] text-mid">
                {renameError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="primary" isLoading={isRenaming}>
                {isRenaming ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="secondary" onClick={cancelRename} disabled={isRenaming}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <h1 className="min-w-0 text-[16px] font-semibold break-words text-ink">{place.name}</h1>
        )}

        {renaming ? null : (
          <div className="relative shrink-0">
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              aria-label={`Manage ${place.name}`}
              onClick={() => {
                setMenuOpen((open) => !open);
              }}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-[8px] border-[1.5px] border-line text-[16px] leading-none text-ink outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span aria-hidden="true">⋯</span>
            </button>
            {menuOpen ? (
              <div
                ref={menuRef}
                id={menuId}
                role="menu"
                tabIndex={-1}
                aria-label={`${place.name} actions`}
                onKeyDown={handleMenuKeyDown}
                className="absolute top-full right-0 z-20 mt-1 flex w-56 flex-col rounded-[8px] border-[1.5px] border-ink bg-paper p-1"
              >
                <MenuItem onSelect={startRename}>Rename</MenuItem>
                <MenuItem
                  onSelect={() => {
                    setMenuOpen(false);
                    setDialog("move");
                  }}
                  hint="Everything inside moves with it"
                >
                  Move into…
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    setMenuOpen(false);
                    setDialog("delete");
                  }}
                >
                  Delete
                </MenuItem>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <MoveDialog
        open={dialog === "move"}
        onClose={closeDialog}
        place={place}
        hasParent={hasParent}
        locations={locations}
        onMoved={() => {
          closeDialog();
          router.refresh();
        }}
      />
      <DeleteDialog
        open={dialog === "delete"}
        onClose={closeDialog}
        place={place}
        itemCount={itemCount}
        placeCount={placeCount}
        onDeleted={() => {
          setDialog(null);
          router.push(afterDeleteHref);
          router.refresh();
        }}
      />
    </div>
  );
}

function MenuItem({ children, hint, onSelect }: { children: string; hint?: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onSelect}
      className="flex min-h-11 flex-col items-start justify-center rounded-[6px] px-[10px] py-[6px] text-left text-[13px] text-ink outline-none hover:bg-wash focus-visible:bg-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink"
    >
      <span className="font-semibold">{children}</span>
      {hint ? <span className="text-[10.5px] text-mid">{hint}</span> : null}
    </button>
  );
}

function MoveDialog({
  open,
  onClose,
  place,
  hasParent,
  locations,
  onMoved,
}: {
  open: boolean;
  onClose: () => void;
  place: { id: string; name: string };
  hasParent: boolean;
  locations: readonly Location[];
  onMoved: () => void;
}) {
  const [chips, setChips] = useState<PathChip[]>([]);
  const [pendingText, setPendingText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isMoving, setIsMoving] = useState(false);

  async function move(parentId: string | null) {
    setError(undefined);
    setIsMoving(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("move_container", {
      p_location_id: place.id,
      ...(parentId === null ? {} : { p_new_parent_id: parentId }),
    });
    setIsMoving(false);

    if (rpcError) {
      if (rpcError.code === UNIQUE_VIOLATION) {
        setError(`There's already a place with this name there. Rename “${place.name}” first, then move it.`);
      } else if (/own descendant|under itself/i.test(rpcError.message)) {
        setError(`“${place.name}” can't go inside itself or a place within it.`);
      } else {
        setError(rpcError.message);
      }
      return;
    }
    setChips([]);
    onMoved();
  }

  const target = lastExistingId(chips);
  const canMove = chips.length > 0 && pendingText.trim() === "" && !isMoving;

  return (
    <Dialog open={open} onClose={onClose} title={`Move “${place.name}” into…`}>
      <LocationPathPicker
        label="New location"
        locations={locations}
        value={chips}
        onChange={setChips}
        onInputChange={setPendingText}
        excludeIds={[place.id]}
        disabled={isMoving}
        pickOnly
      />
      <p className="text-[10.5px] text-mid">
        “{place.name}” and the places inside it aren&apos;t offered. Everything inside moves with it.
      </p>
      {error ? (
        <p role="alert" className="text-[11.5px] text-mid">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        {hasParent ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isMoving}
            onClick={() => {
              void move(null);
            }}
          >
            Top level
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={onClose} disabled={isMoving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={!canMove}
          isLoading={isMoving}
          onClick={() => {
            if (target !== null) {
              void move(target);
            }
          }}
        >
          {isMoving ? "Moving…" : "Move"}
        </Button>
      </div>
    </Dialog>
  );
}

function DeleteDialog({
  open,
  onClose,
  place,
  itemCount,
  placeCount,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  place: { id: string; name: string };
  itemCount: number;
  placeCount: number;
  onDeleted: () => void;
}) {
  const [error, setError] = useState<string | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  const isEmpty = itemCount === 0 && placeCount === 0;

  async function confirmDelete() {
    setError(undefined);
    setIsDeleting(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("delete_container", { p_location_id: place.id });
    setIsDeleting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onDeleted();
  }

  if (!isEmpty) {
    return (
      <Dialog open={open} onClose={onClose} title={`“${place.name}” isn't empty`}>
        <p className="text-[12px] text-mid">
          It still holds {describeContents(itemCount, placeCount)}. Move or delete them first.
        </p>
        <div className="flex justify-end">
          <Button type="button" variant="primary" onClick={onClose}>
            OK
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Delete “${place.name}”?`}>
      <p className="text-[12px] text-mid">It&apos;s empty. This can&apos;t be undone.</p>
      {error ? (
        <p role="alert" className="text-[11.5px] text-mid">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          isLoading={isDeleting}
          onClick={() => {
            void confirmDelete();
          }}
        >
          {isDeleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </Dialog>
  );
}
