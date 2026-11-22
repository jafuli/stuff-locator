"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { StashLink } from "@/components/stash-link";
import { StuffListSkeleton } from "@/components/stuff-list-skeleton";
import { StuffSearchInput } from "@/components/stuff-search-input";
import { StuffViewChips, type StuffView } from "@/components/stuff-view-chips";
import { STUFF_PATH } from "@/lib/routes";
import { ONBOARDING_HEADING, STUFF_HEADING } from "@/lib/stuff-heading";

/**
 * What the page under the header is showing:
 * - "list": the normal views, with search, Stash and the chips.
 * - "onboarding": GuidedOnboarding, which is the only way forward, so the
 *   header drops search, Stash and the chips and asks its own question.
 * - "setup": the household-setup retry, where there's nothing to search.
 */
export type StuffViewMode = "list" | "onboarding" | "setup";

export interface RegisteredStuffView {
  /** The household's item count, for "All (n)". */
  total: number;
  mode: StuffViewMode;
}

interface StuffViewsContextValue {
  query: string;
  /** Pages call this (through RegisterStuffView) once their data is on screen. */
  setView: (view: RegisteredStuffView | null) => void;
  /** The results list hands over its "start the model" callback (ADR 0012). */
  registerIntent: (onIntent: (() => void) | null) => void;
}

const StuffViewsContext = createContext<StuffViewsContextValue | null>(null);

/** The shared search query and the hooks the pages under the header use. */
export function useStuffViews(): StuffViewsContextValue {
  const value = useContext(StuffViewsContext);
  if (value === null) {
    throw new Error("useStuffViews must be used inside StuffViewsShell");
  }
  return value;
}

function viewOf(pathname: string | null): StuffView | null {
  if (pathname === STUFF_PATH) {
    return "all";
  }
  if (pathname === "/browse") {
    return "place";
  }
  return null;
}

/**
 * The Stuff screen (STUFF_PATH) and Browse (/browse) as one screen with a
 * toggle: this is their shared layout's frame, so the heading, the search
 * field, Stash and the All / By place chips are rendered once and never
 * unmount when you switch. Only the list under them changes.
 *
 * - The search query lives here, so typing on Browse searches right there
 *   (the page shows results under the header) and a query survives a switch.
 * - Until the page below has its data (it says so with RegisterStuffView),
 *   the search field is disabled: there's nothing to search yet.
 * - On a slow connection a chip's navigation can wait on the server before
 *   anything changes. The chips report that pending phase (useLinkStatus),
 *   and the shell selects the tapped chip and shows the list skeleton at
 *   once. A prefetched route skips the pending phase; its loading.tsx shows
 *   instead, which looks the same.
 */
export function StuffViewsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [view, setViewState] = useState<RegisteredStuffView | null>(null);
  // The last view any page registered. Kept while the next one loads, so the
  // heading and the "All (n)" count don't blink between two views.
  const [lastView, setLastView] = useState<RegisteredStuffView | null>(null);
  const [pendingView, setPendingView] = useState<StuffView | null>(null);
  const intentRef = useRef<(() => void) | null>(null);

  const setView = useCallback((next: RegisteredStuffView | null) => {
    setViewState(next);
    if (next !== null) {
      setLastView(next);
    }
  }, []);
  const registerIntent = useCallback((onIntent: (() => void) | null) => {
    intentRef.current = onIntent;
  }, []);
  const onPendingChange = useCallback((target: StuffView, pending: boolean) => {
    setPendingView((current) => (pending ? target : current === target ? null : current));
  }, []);

  const contextValue = useMemo(() => ({ query, setView, registerIntent }), [query, setView, registerIntent]);

  const currentView = viewOf(pathname);
  const isSwitching = pendingView !== null && pendingView !== currentView;
  const isLoading = view === null || isSwitching;
  const mode = lastView?.mode ?? "list";

  return (
    <StuffViewsContext.Provider value={contextValue}>
      <main className="flex flex-col gap-4 px-gutter pt-6">
        <h1 className="text-display text-ink">{mode === "onboarding" ? ONBOARDING_HEADING : STUFF_HEADING}</h1>
        {mode === "list" ? (
          <>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <StuffSearchInput
                  value={query}
                  disabled={isLoading}
                  onChange={(value) => {
                    setQuery(value);
                    intentRef.current?.();
                  }}
                  onFocus={() => {
                    intentRef.current?.();
                  }}
                />
              </div>
              <StashLink />
            </div>
            <StuffViewChips
              total={lastView?.total ?? null}
              active={isSwitching ? pendingView : currentView}
              onPendingChange={onPendingChange}
            />
          </>
        ) : null}
        {isSwitching ? <StuffListSkeleton /> : children}
      </main>
    </StuffViewsContext.Provider>
  );
}

/**
 * Rendered by a page under the shell once its data is loaded: tells the
 * header the count, which header to show, and that the search field can be
 * used. Unmounting (the page being replaced) puts the header back into its
 * loading state.
 */
export function RegisterStuffView({ total, mode }: RegisteredStuffView) {
  const { setView } = useStuffViews();
  useEffect(() => {
    setView({ total, mode });
    return () => {
      setView(null);
    };
  }, [setView, total, mode]);
  return null;
}
