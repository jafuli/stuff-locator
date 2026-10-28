"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { validatePlaceName } from "@/lib/location-validation";
import { createClient } from "@/server/db/client";

export interface AddPlaceHereProps {
  /** The place the new one goes inside; null adds a top-level place. */
  parentId: string | null;
}

const UNIQUE_VIOLATION = "23505";

/**
 * "+ Add a place here": a name-only shortcut for making a place where you
 * are (ADR 0010). Creating places mostly happens in the item picker, where a
 * place is born with its item; this is the way to make an empty one.
 *
 * Calls `create_location`, which does not reuse a same-named sibling — a
 * duplicate raises 23505 so the person is told, rather than being silently
 * pointed at the existing one.
 */
export function AddPlaceHere({ parentId }: AddPlaceHereProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<() => void>(() => undefined);

  // Move focus into the field when it appears (a button was just replaced by
  // it, so focus would otherwise fall back to <body>).
  useEffect(() => {
    if (isOpen) {
      document.getElementById("add-place-name")?.focus();
    }
  }, [isOpen]);

  // Escape cancels, wherever focus is inside the open form.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function close() {
    setIsOpen(false);
    setName("");
    setError(undefined);
    // The trigger was unmounted while the field was open; focus returns once
    // it is back.
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  useEffect(() => {
    closeRef.current = close;
  });

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const validation = validatePlaceName(name);
    if (validation) {
      setError(validation);
      return;
    }

    const trimmed = name.trim().replace(/\s+/g, " ");
    setError(undefined);
    setIsSaving(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("create_location", {
      p_name: trimmed,
      ...(parentId === null ? {} : { p_parent_id: parentId }),
    });
    setIsSaving(false);

    if (rpcError) {
      setError(rpcError.code === UNIQUE_VIOLATION ? `You already have “${trimmed}” here.` : rpcError.message);
      return;
    }

    close();
    router.refresh();
  }

  if (!isOpen) {
    return (
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
        className="min-h-14 w-full rounded-panel border border-dashed border-border-strong bg-surface px-4 text-left text-body text-muted outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        + Add a place here
      </button>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-3 rounded-panel border border-dashed border-border-strong bg-surface p-4"
    >
      <FormField
        id="add-place-name"
        label="Place name"
        type="text"
        value={name}
        onChange={setName}
        error={error}
        disabled={isSaving}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" isLoading={isSaving}>
          {isSaving ? "Adding…" : "Add"}
        </Button>
        <Button type="button" variant="secondary" onClick={close} disabled={isSaving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
