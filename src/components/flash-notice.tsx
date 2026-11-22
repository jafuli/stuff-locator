"use client";

import { useEffect, useState } from "react";
import { urlWithoutNotice } from "@/lib/flash-notice";

export interface FlashNoticeProps {
  /** The text to show, already worked out by the page; null shows nothing. */
  message: string | null;
}

/**
 * A short confirmation at the top of the page a save or delete landed on
 * ("Saved", "Deleted Passport"). See src/lib/flash-notice.ts.
 *
 * The live region is always in the DOM and the text is put into it just
 * after mount: a region that arrives already holding its text is often not read
 * out, which is the whole point of this notice for a screen-reader user
 * (focus lands on a new page, so nothing else tells them the save worked).
 *
 * Once shown, the notice parameter is removed from the address bar with
 * `history.replaceState`, which Next's router supports and which doesn't
 * trigger a fetch. The text stays on screen until the next navigation.
 */
export function FlashNotice({ message }: FlashNoticeProps) {
  const [shown, setShown] = useState<string | null>(null);

  useEffect(() => {
    if (message === null) {
      return;
    }
    const cleaned = urlWithoutNotice(window.location.href);
    if (cleaned !== null) {
      window.history.replaceState(null, "", cleaned);
    }
    // A tick later, so the empty region is in the accessibility tree before
    // its text arrives — that change is what gets announced.
    const timer = window.setTimeout(() => {
      setShown(message);
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message]);

  return (
    <p
      role="status"
      className={
        shown
          ? "rounded-panel border border-hairline bg-surface px-4 py-3 text-body text-ink shadow-control"
          : "sr-only"
      }
    >
      {shown}
    </p>
  );
}
