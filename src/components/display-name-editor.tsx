"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type SubmitEvent } from "react";
import { CheckIcon, CloseIcon, PencilIcon } from "@/components/icons";
import { CharacterCounter, counterDescribedBy } from "@/components/ui/character-counter";
import { normalizeDisplayName, validateDisplayName } from "@/lib/auth-validation";
import { cn } from "@/lib/cn";
import { TOO_LONG_MESSAGE } from "@/lib/limit-errors";
import { TEXT_LIMITS } from "@/lib/limits";
import { createClient } from "@/server/db/client";

const ICON_BUTTON =
  "inline-flex min-h-target-min min-w-target-min shrink-0 items-center justify-center rounded-control text-muted " +
  "hover:bg-divider focus-ring disabled:opacity-60";

const SAVE_FAILED = "Your name couldn't be saved. Check your connection and try again.";
const CHECK_VIOLATION = "23514";

export interface DisplayNameEditorProps {
  /** Fires after a rename lands, for anything on screen that shows the name outside the router's refresh. */
  onSaved?: () => void;
}

type Loaded = { status: "loading" } | { status: "failed" } | { status: "ready"; userId: string; name: string };

/**
 * "Your name" in the household sheet, editable in place. Shown with an
 * edit button; editing turns the name into a field with Save (✓) and
 * Cancel (✕) buttons. Enter saves, Escape cancels (without closing the
 * sheet), and focus returns to the edit button either way. A blank name is
 * refused; saving disables the controls until the write lands.
 *
 * Writes `profiles.display_name` directly, through the "you can rename
 * yourself" policy (the column is the only one `authenticated` may update),
 * guarded by the 50-character CHECK. Every screen resolves names at read
 * time, so a router.refresh() is enough for Stuff, item detail and Activity
 * — past events included — to show the new name.
 */
export function DisplayNameEditor({ onSaved }: DisplayNameEditorProps = {}) {
  const router = useRouter();
  const inputId = useId();
  const labelId = useId();
  const errorId = `${inputId}-error`;
  const counterId = `${inputId}-counter`;
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const mounted = { current: true };
    const supabase = createClient();
    async function load(): Promise<Loaded> {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (userId === undefined) {
        return { status: "failed" };
      }
      const { data } = await supabase.from("profiles").select("display_name").eq("user_id", userId).maybeSingle();
      return data ? { status: "ready", userId, name: data.display_name } : { status: "failed" };
    }
    load()
      .catch((): Loaded => ({ status: "failed" }))
      .then((next) => {
        if (mounted.current) {
          setLoaded(next);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, []);

  // The edit button was just replaced by the field: put focus in it.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  if (loaded.status !== "ready") {
    return (
      <div className="flex min-h-14 flex-col justify-center px-5 py-2" aria-busy={loaded.status === "loading"}>
        <p className="text-meta text-muted">Your name</p>
        <p className="text-body text-muted">
          {loaded.status === "loading" ? "Loading…" : "Your name couldn't be loaded."}
        </p>
      </div>
    );
  }

  const { userId, name } = loaded;

  function startEditing() {
    setDraft(name);
    setError(undefined);
    setEditing(true);
  }

  function stopEditing() {
    setEditing(false);
    setError(undefined);
    // The button comes back once the field is gone.
    requestAnimationFrame(() => editButtonRef.current?.focus());
  }

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const invalid = validateDisplayName(draft);
    if (invalid) {
      setError(invalid);
      inputRef.current?.focus();
      return;
    }
    const next = normalizeDisplayName(draft);
    if (next === name) {
      stopEditing();
      return;
    }

    setError(undefined);
    setIsSaving(true);
    const { data, error: updateError } = await createClient()
      .from("profiles")
      .update({ display_name: next })
      .eq("user_id", userId)
      .select("display_name")
      .single();
    setIsSaving(false);

    if (updateError) {
      setError(updateError.code === CHECK_VIOLATION ? TOO_LONG_MESSAGE : SAVE_FAILED);
      inputRef.current?.focus();
      return;
    }
    setLoaded({ status: "ready", userId, name: data.display_name });
    stopEditing();
    onSaved?.();
    router.refresh();
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      // Cancel the edit, not the whole sheet. The Dialog closes on Escape
      // from a keydown listener on `document`; in the App Router React's
      // own root listener is on `document` too (registered first, at
      // hydration), so plain stopPropagation can't keep the Dialog's
      // listener from running — stopImmediatePropagation does.
      event.nativeEvent.stopImmediatePropagation();
      event.stopPropagation();
      if (!isSaving) {
        stopEditing();
      }
    }
  }

  if (!editing) {
    return (
      <div className="flex min-h-14 items-center justify-between gap-3 px-5 py-2">
        <div className="min-w-0">
          <p id={labelId} className="text-meta text-muted">
            Your name
          </p>
          <p className="text-body break-words text-ink">{name}</p>
        </div>
        <button
          ref={editButtonRef}
          type="button"
          aria-label="Edit your name"
          onClick={startEditing}
          className={ICON_BUTTON}
        >
          <PencilIcon />
        </button>
      </div>
    );
  }

  const describedBy = [error ? errorId : null, counterDescribedBy(counterId, draft, TEXT_LIMITS.displayName)]
    .filter(Boolean)
    .join(" ");

  return (
    <form noValidate onSubmit={(event) => void save(event)} className="flex items-start gap-2 px-5 py-2">
      <div className="min-w-0 flex-1">
        <label htmlFor={inputId} className="mb-1 block text-meta text-muted">
          Your name
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          autoComplete="name"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            // An error under the field goes as soon as the field changes.
            setError(undefined);
          }}
          onKeyDown={handleKeyDown}
          maxLength={TEXT_LIMITS.displayName}
          disabled={isSaving}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          className={cn(
            "min-h-control-height w-full rounded-control border bg-surface px-4 text-body text-ink shadow-control",
            "focus-visible:border-border-strong focus-ring disabled:opacity-60",
            error ? "border-border-strong" : "border-border-control",
          )}
        />
        <CharacterCounter id={counterId} value={draft} max={TEXT_LIMITS.displayName} />
        {error ? (
          <p id={errorId} role="alert" className="mt-1 text-meta text-signal">
            {error}
          </p>
        ) : null}
        <p role="status" className="sr-only">
          {isSaving ? "Saving your name…" : ""}
        </p>
      </div>
      {/* Aligned with the field, below its label. */}
      <div className="mt-6 flex gap-1">
        <button type="submit" aria-label="Save name" aria-busy={isSaving} disabled={isSaving} className={ICON_BUTTON}>
          <CheckIcon />
        </button>
        <button type="button" aria-label="Cancel" onClick={stopEditing} disabled={isSaving} className={ICON_BUTTON}>
          <CloseIcon />
        </button>
      </div>
    </form>
  );
}
