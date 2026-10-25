"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { useHasSession } from "@/components/use-has-session";
import { Dialog } from "@/components/ui/dialog";
import { FALLBACK_INITIALS, householdInitials } from "@/lib/household-initials";
import { createClient } from "@/server/db/client";

const ROW_CLASSES =
  "flex min-h-14 items-center px-5 text-body text-ink outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

/**
 * The household's name, read through the caller's own RLS-scoped session
 * (the same select the join flow uses) — null while loading or if it can't
 * be read, in which case the button just shows the fallback initial.
 */
function useHouseholdName(enabled: boolean): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    let isMounted = true;
    void createClient()
      .from("household_members")
      .select("households(name)")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted) {
          setName(data?.households.name ?? null);
        }
      });
    return () => {
      isMounted = false;
    };
  }, [enabled]);

  return enabled ? name : null;
}

/**
 * The household button and the sheet it opens: Invite partner and Sign out.
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
  const householdName = useHouseholdName(hasSession);
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

  const initials = householdName === null ? FALLBACK_INITIALS : householdInitials(householdName);

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
        className="flex size-11 items-center justify-center rounded-full border border-border-control bg-surface text-meta text-muted shadow-control outline-none transition-colors duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        {initials}
      </button>
      <Dialog variant="sheet" open={open} onClose={close} title={householdName ?? "Your household"}>
        <ul className="flex flex-col divide-y divide-divider border-t border-divider">
          <li>
            <Link href="/settings/invite" onClick={close} className={ROW_CLASSES}>
              Invite partner
            </Link>
          </li>
          <li>
            <SignOutButton assumeSession />
          </li>
        </ul>
      </Dialog>
    </>
  );
}
