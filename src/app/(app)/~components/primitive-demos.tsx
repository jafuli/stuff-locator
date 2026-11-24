"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { StuffSearchInput } from "@/components/stuff-search-input";
import { Dialog } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";

function noop(): void {
  // The disabled field never fires onChange; the prop is required.
}

/** Client leaves for the catalog: FormField is controlled and Dialog is stateful, everything else on the page is a Server Component. */

export function FormFieldDemo() {
  // useId keeps ids unique when the catalog renders this once per theme pane.
  const id = useId();
  const [email, setEmail] = useState("");
  const [filled, setFilled] = useState("Passport");
  const [bad, setBad] = useState("not-an-email");
  return (
    <div className="flex flex-col gap-4">
      <FormField id={`${id}-empty`} label="Email" type="email" value={email} onChange={setEmail} />
      <FormField id={`${id}-filled`} label="Name" type="text" value={filled} onChange={setFilled} />
      <FormField
        id={`${id}-error`}
        label="Email"
        type="email"
        value={bad}
        onChange={setBad}
        error="Enter a valid email address."
      />
      <FormField id={`${id}-disabled`} label="Locked" type="text" value="Read only" onChange={noop} disabled />
    </div>
  );
}

/** Text fields near and at their limits: the counter from 90%, typing stopped at the limit. */
export function CharacterCounterDemo() {
  const id = useId();
  const [near, setNear] = useState("A spare key for the shed, the bike lock and the old garage padlock");
  const [full, setFull] = useState("x".repeat(60));
  return (
    <div className="flex flex-col gap-4">
      <FormField id={`${id}-near`} label="Name (80)" type="text" value={near} onChange={setNear} maxLength={80} />
      <FormField id={`${id}-full`} label="Place name (60)" type="text" value={full} onChange={setFull} maxLength={60} />
    </div>
  );
}

export function DialogDemo({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Delete this item?"
      >
        <p className="text-body text-muted">It disappears for both of you. This can&apos;t be undone.</p>
        <div className="flex gap-3">
          <Button
            variant="primary"
            onClick={() => {
              setOpen(false);
            }}
          >
            Keep it
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setOpen(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </Dialog>
    </>
  );
}

/**
 * The household button + sheet as the shell renders them, but with fixed
 * initials and no session or router behind it — so the catalog can show the
 * look in both themes. Rows are inert here.
 */
export function HouseholdSheetDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex justify-end">
      <button
        type="button"
        aria-label="Household menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen(true);
        }}
        className="flex size-11 items-center justify-center rounded-full border border-border-control bg-surface text-meta text-muted shadow-control focus-ring"
      >
        SH
      </button>
      <Dialog
        variant="sheet"
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Shared home"
      >
        <ul className="flex flex-col divide-y divide-divider border-t border-divider">
          {["Invite partner"].map((label) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                }}
                className="flex min-h-14 w-full items-center px-5 text-left text-body text-ink focus-ring-inset"
              >
                {label}
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
              }}
              className="flex min-h-14 w-full items-center px-5 text-left text-body text-signal focus-ring-inset"
            >
              Sign out
            </button>
          </li>
        </ul>
      </Dialog>
    </div>
  );
}

export function StuffSearchDemo() {
  const [query, setQuery] = useState("");
  return <StuffSearchInput value={query} onChange={setQuery} />;
}
