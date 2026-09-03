import { StuffList, type StuffListEntry } from "@/components/stuff-list";
import { ITEMS } from "@/lib/fixtures/items";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { getBreadcrumbNames } from "@/lib/fixtures/location-path";

// Wireframe screen 02, "Home — everything (default)": search box + the full
// item list, each row showing its full location path. The "All/By place/
// Recent" toggle chips and the "+" add-item FAB drawn on that screen are
// separate flows (Browse, Stash) — out of scope here, not silently dropped.
export default function Page() {
  const entries: StuffListEntry[] = ITEMS.map((item) => ({
    item,
    path: getBreadcrumbNames(item.locationId, LOCATIONS),
  }));

  return (
    <main className="flex flex-col gap-3 p-4">
      <h1 className="text-[16px] font-semibold text-ink">Our stuff</h1>

      {/*
        Visual-only per this task's scope — real search is a separate future
        task. Enabled (not disabled) so it matches the wireframe's fidelity
        and stays keyboard-focusable; uncontrolled (no value/onChange) so
        typing is inert without React complaining about a value-less
        controlled input. type="text" + explicit role="searchbox" rather
        than type="search": Chromium injects a client-only inline style onto
        native <input type="search"> elements (its own clear-button
        bookkeeping), which caused a real hydration mismatch against the
        server-rendered HTML. This sidesteps that while keeping the same
        accessible role and visual result.
      */}
      <div role="search">
        <label htmlFor="stuff-search" className="sr-only">
          Search your stuff
        </label>
        <input
          id="stuff-search"
          type="text"
          role="searchbox"
          placeholder="Search…"
          autoComplete="off"
          className="w-full rounded-[9px] border-[1.5px] border-line px-[10px] py-[8px] text-[12.5px] text-ink outline-none placeholder:text-mid focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        />
      </div>

      <StuffList entries={entries} />
    </main>
  );
}
