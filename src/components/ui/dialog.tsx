"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  /** Called on Escape and on a backdrop click. */
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Set to false for a destructive confirmation that must be answered with a button. */
  dismissOnBackdrop?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog with the behaviours a real one needs, without the native
 * <dialog> element (not implemented in the jsdom the unit tests run in):
 * role="dialog" + aria-modal, a Tab/Shift+Tab focus trap, Escape to close,
 * initial focus inside, and focus returned to whatever opened it.
 *
 * Renders nothing while closed, so its contents mount fresh each time.
 */
export function Dialog({ open, onClose, title, children, dismissOnBackdrop = true }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // The element focused when the dialog opened, to hand focus back on close.
  const openerRef = useRef<HTMLElement | null>(null);
  // Latest onClose without re-subscribing the key handler on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // Prefer a field or the first control; fall back to the panel itself.
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    // Escape and the Tab trap live on the document so they hold wherever
    // focus is, not just inside the panel's own handlers.
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      const firstEl = focusable.at(0);
      const lastEl = focusable.at(-1);
      if (!firstEl || !lastEl) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (!panelRef.current?.contains(active)) {
        event.preventDefault();
        firstEl.focus();
      } else if (event.shiftKey && active === firstEl) {
        event.preventDefault();
        lastEl.focus();
      } else if (!event.shiftKey && active === lastEl) {
        event.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const opener = openerRef.current;
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      {/* The scrim is a real (but untabbable) button, so a tap outside the
          panel closes the dialog without a non-semantic click handler. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        disabled={!dismissOnBackdrop}
        onClick={onClose}
        // Neutral black rather than a token: the scrim has to darken both themes, and
        // `ink` is light in dark mode.
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-full w-full max-w-sm flex-col gap-3 overflow-y-auto rounded-panel border border-hairline bg-surface p-5 text-body text-ink shadow-float outline-none"
      >
        <h2 id={titleId} className="text-title text-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
