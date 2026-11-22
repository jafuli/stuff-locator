"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { browseDeletedHref } from "@/lib/flash-notice";
import { createClient } from "@/server/db/client";

export interface ItemDeleteButtonProps {
  item: { id: string; name: string; locationId: string };
}

/**
 * Delete, on the item's own page: a line-icon trash button that opens the
 * shared Dialog to confirm, the same pattern as deleting a place in Browse
 * (place-manager.tsx). The icon is `signal` (a small marker, not a fill) and
 * its accessible name says what it does and to what.
 *
 * Confirming calls `delete_item` (it records the "deleted" event), then
 * replaces this page with the Browse page of the place the item was in,
 * carrying a "Deleted <name>" notice (src/lib/flash-notice.ts). `replace`,
 * so Back and reload never land on a page for an item that is gone.
 *
 * Cancel, Escape and a tap on the backdrop all close it, matching Browse's
 * delete-place dialog (Itamar's call: the two delete dialogs behave the same).
 * Focus starts on Cancel, so nothing is deleted without pressing Delete.
 */
export function ItemDeleteButton({ item }: ItemDeleteButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);

  // Escape, Cancel and the backdrop close it, but not while the delete is in flight.
  function close() {
    if (isDeleting) {
      return;
    }
    setOpen(false);
    setError(undefined);
  }

  async function confirmDelete() {
    setError(undefined);
    setIsDeleting(true);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("delete_item", { p_item_id: item.id });

    if (rpcError) {
      setIsDeleting(false);
      setError(rpcError.message);
      return;
    }
    // Stays in its "Deleting…" state while the navigation lands.
    router.replace(browseDeletedHref(item.locationId, item.name));
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        aria-label={`Delete ${item.name}`}
        onClick={() => {
          setOpen(true);
        }}
        className="inline-flex min-h-target-min min-w-target-min items-center justify-center rounded-control border border-border-strong bg-surface text-signal shadow-control focus-ring"
      >
        <TrashIcon />
      </button>

      <Dialog open={open} onClose={close} title={`Delete “${item.name}”?`}>
        <p className="text-body text-muted">This can&apos;t be undone.</p>
        {error ? (
          <p role="alert" className="text-meta text-signal">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            isLoading={isDeleting}
            onClick={() => {
              void confirmDelete();
            }}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
