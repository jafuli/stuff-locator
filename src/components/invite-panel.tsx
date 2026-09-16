"use client";

import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

export interface InvitePanelProps {
  code: string;
}

// window.location.origin never changes during a page's lifetime, so this
// external store never needs to notify anything — subscribe is a no-op.
function subscribeToOrigin(): () => void {
  return () => undefined;
}

function getClientOrigin(): string {
  return window.location.origin;
}

// Rendered both server-side and during React's first client hydration
// pass, so it must match what the server actually sent (no `window`
// there) — relative, not absolute. useSyncExternalStore swaps to the real
// getClientOrigin() value right after hydration, without the setState-in-
// effect pattern eslint-plugin-react-hooks flags for deriving state that
// could otherwise be read directly.
function getServerOrigin(): string {
  return "";
}

/**
 * Displays a real invite code and its shareable link, with a
 * copy-to-clipboard affordance and a visible "Copied!" confirmation
 * (AC #4). The full `${origin}/join/{code}` link can only be computed
 * client-side — there's no reliable server-side "current origin" without
 * trusting a forwarded header.
 */
export function InvitePanel({ code }: InvitePanelProps) {
  const origin = useSyncExternalStore(subscribeToOrigin, getClientOrigin, getServerOrigin);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const link = `${origin}/join/${code}`;

  async function handleCopy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clears any earlier success too — otherwise a failed retry after a
      // prior successful copy (e.g. clipboard permission revoked
      // mid-session) would show "Copied!" and the error message at the
      // same time, a real contradiction a caught-in-review bug produced.
      setCopied(false);
      setCopyError("Couldn't copy automatically — copy the link above manually.");
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
      <div>
        <p className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">Invite code</p>
        <p className="text-[15px] font-semibold text-ink">{code}</p>
      </div>

      <div>
        <p className="text-[9.5px] font-semibold tracking-[.06em] text-mid uppercase">Shareable link</p>
        <p className="break-all text-[12px] text-ink">{link}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="primary" onClick={() => void handleCopy()}>
          Copy link
        </Button>
        {/* aria-live so screen reader users get the confirmation too, not
            just a sighted label swap. */}
        <p aria-live="polite" className="text-[11.5px] text-mid">
          {copied ? "Copied!" : ""}
        </p>
      </div>
      {copyError ? (
        <p role="alert" className="text-[10.5px] text-mid">
          {copyError}
        </p>
      ) : null}
    </div>
  );
}
