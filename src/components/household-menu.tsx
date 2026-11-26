"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { DisplayNameEditor } from "@/components/display-name-editor";
import { SignOutButton } from "@/components/sign-out-button";
import { useHasSession } from "@/components/use-has-session";
import { Dialog } from "@/components/ui/dialog";
import { householdInitials } from "@/lib/household-initials";
import { householdTitle, readHouseholdIdentity, type HouseholdIdentity } from "@/lib/household-title";
import { createClient } from "@/server/db/client";

const ROW_CLASSES = "flex min-h-14 items-center px-5 text-body text-ink focus-ring-inset";

/**
 * The household's chosen name and its owner's display name, read through
 * the caller's own RLS-scoped session — null while loading or if they can't
 * be read, in which case the button shows the fallback initial and the
 * sheet says "Your household". `reload` re-reads them, for after the owner
 * renames themselves.
 */
function useHouseholdIdentity(enabled: boolean): { identity: HouseholdIdentity | null; reload: () => void } {
  const [identity, setIdentity] = useState<HouseholdIdentity | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let isMounted = true;
    void readHouseholdIdentity(createClient()).then((next) => {
      if (isMounted) {
        setIdentity(next);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [enabled, version]);

  const reload = useCallback(() => {
    setVersion((previous) => previous + 1);
  }, []);

  return { identity: enabled ? identity : null, reload };
}

/**
 * The household button and the sheet it opens: Invite partner, your own
 * name (editable in place, DisplayNameEditor) and Sign out. Invite partner
 * stays first, so it is what the sheet focuses when it opens.
 * This is the primary way to reach both, so the app shell no longer carries
 * a loose Invite link and a bare Sign out button under the tabs. There is
 * deliberately no Settings row yet: the only settings page is
 * /settings/invite, which Invite partner already reaches, so a second row
 * would be a duplicate. Add it when a real settings page exists (tracked in
 * Notion: "Settings page + household sheet Settings row"). The button is deliberately secondary — a small outlined circle with
 * muted initials — so it never reads as a create action.
 *
 * Renders nothing without a session, like the Sign out control it replaces.
 */
export function HouseholdMenu() {
  const hasSession = useHasSession();
  const { identity, reload } = useHouseholdIdentity(hasSession);
  const [open, setOpen] = useState(false);
  // Dialog hands focus back to whatever had it on open; the ref is here so
  // closing via a link click (which navigates) still ends on the button.
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!hasSession) {
    return null;
  }

  function close() {
    setOpen(false);
  }

  // The initial is always the owner's, never from a chosen household name.
  const initials = householdInitials(identity?.ownerDisplayName);
  const title = (identity === null ? null : householdTitle(identity)) ?? "Your household";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Household menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
        className="flex size-11 items-center justify-center rounded-full border border-border-control bg-surface text-meta text-muted shadow-control transition-colors duration-150 ease-out focus-ring"
      >
        {initials}
      </button>
      <Dialog variant="sheet" open={open} onClose={close} title={title}>
        <ul className="flex flex-col divide-y divide-divider border-t border-divider">
          <li>
            <Link href="/settings/invite" onClick={close} className={ROW_CLASSES}>
              Invite partner
            </Link>
          </li>
          <li>
            <DisplayNameEditor onSaved={reload} />
          </li>
          <li>
            <SignOutButton assumeSession />
          </li>
        </ul>
      </Dialog>
    </>
  );
}
