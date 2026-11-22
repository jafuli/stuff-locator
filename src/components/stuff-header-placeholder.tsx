import { SearchIcon } from "@/components/icons";
import { StashLink } from "@/components/stash-link";
import { StuffViewChips, type StuffView } from "@/components/stuff-view-chips";
import { STUFF_HEADING } from "@/lib/stuff-heading";

export interface StuffHeaderPlaceholderProps {
  /** The view that's loading, so its chip is already the selected one. */
  active: StuffView;
}

/**
 * The Stuff / Browse header while the page's data loads: the same heading,
 * search row, Stash button and All / By place chips as the loaded page, in
 * the same places. Only the list below is a skeleton. Switching between the
 * two views then changes nothing above the list. Before, the loading screen
 * drew the search field as a pulsing box and dropped the chips and Stash,
 * so every switch flashed a different header in between.
 *
 * The search field is a static copy of StuffSearchInput (hidden from
 * assistive tech): a real input would drop anything typed into it when the
 * loaded page replaces it. Stash and the chips are the real links; the "All"
 * count isn't known yet, so it reads "All (…)".
 */
export function StuffHeaderPlaceholder({ active }: StuffHeaderPlaceholderProps) {
  return (
    <>
      <h1 className="text-display text-ink">{STUFF_HEADING}</h1>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {/* Same classes as StuffSearchInput's input, so nothing shifts when it swaps in. */}
          <div
            aria-hidden="true"
            className="relative flex min-h-control-height w-full items-center rounded-control border border-border-control bg-surface pr-4 pl-11 text-body text-muted shadow-control"
          >
            <SearchIcon className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
            Search…
          </div>
        </div>
        <StashLink />
      </div>
      <StuffViewChips total={null} active={active} />
    </>
  );
}
