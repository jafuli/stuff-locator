import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";
import { ItemCard } from "@/components/item-card";
import { ItemCardSkeleton } from "@/components/item-card-skeleton";
import { BottomNav } from "@/components/bottom-nav";
import { AutocompleteDemo } from "./autocomplete-demo";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { ITEMS } from "@/lib/fixtures/items";
import { getBreadcrumbSegments, getFullLocationPaths } from "@/lib/fixtures/location-path";
import { NAV_TABS } from "@/lib/nav-tabs";

const locationOptions = getFullLocationPaths(LOCATIONS);
const segmentsFor = (locationId: string) => getBreadcrumbSegments(locationId, LOCATIONS);

export default function ComponentsDemoPage() {
  return (
    <main className="mx-auto flex max-w-screen-sm flex-col gap-10 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Component catalog</h1>
        <p className="mt-1 text-sm text-mid">
          An unlinked, always-reachable demo of the six shared UI primitives, matched against the wireframes.
          Ships to prod like <code>/~offline</code> does — reachable by URL, not linked from any nav.
        </p>
      </div>

      <section aria-labelledby="button-heading" className="flex flex-col gap-3">
        <h2 id="button-heading" className="text-base font-semibold text-ink">
          Button
        </h2>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary">Save and continue</Button>
          <Button variant="secondary">I don&apos;t have one</Button>
          <Button variant="primary" disabled>
            Save and continue
          </Button>
          <Button variant="primary" isLoading>
            Saving…
          </Button>
        </div>
      </section>

      <section aria-labelledby="empty-state-heading" className="flex flex-col gap-3">
        <h2 id="empty-state-heading" className="text-base font-semibold text-ink">
          Empty state
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <EmptyState
            title="No items yet"
            description="Stash your first thing to see it here."
            action={<Button variant="primary">Add an item</Button>}
          />
          <EmptyState title="Nothing else close" description={'Try "documents" or browse by place.'} />
        </div>
      </section>

      <section aria-labelledby="breadcrumb-heading" className="flex flex-col gap-3">
        <h2 id="breadcrumb-heading" className="text-base font-semibold text-ink">
          Location breadcrumb
        </h2>
        <LocationBreadcrumb
          segments={[
            { id: "bedroom", name: "Bedroom" },
            { id: "bedroom-filing-box", name: "Filing box" },
          ]}
        />
        <div className="max-w-[320px] rounded-[7px] bg-wash p-3">
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Wraps at 320px, never truncates</p>
          <LocationBreadcrumb
            segments={[
              { id: "garage", name: "Garage" },
              { id: "garage-closet", name: "Closet" },
              { id: "garage-closet-toolbox", name: "Toolbox" },
              { id: "garage-closet-toolbox-locked-cabinet", name: "Locked cabinet" },
              { id: "garage-closet-toolbox-locked-cabinet-top-shelf", name: "Top shelf" },
              { id: "garage-closet-toolbox-locked-cabinet-top-shelf-red-box", name: "Red box" },
            ]}
          />
        </div>
      </section>

      <section aria-labelledby="item-card-heading" className="flex flex-col gap-3">
        <h2 id="item-card-heading" className="text-base font-semibold text-ink">
          Item card — states
        </h2>

        <div>
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Success</p>
          <div>
            {ITEMS.slice(0, 4).map((item) => (
              <ItemCard key={item.id} item={item} segments={segmentsFor(item.locationId)} href={`/items/${item.id}`} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Loading</p>
          <div>
            <ItemCardSkeleton />
            <ItemCardSkeleton />
            <ItemCardSkeleton />
          </div>
        </div>

        <div>
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Empty</p>
          <EmptyState
            title="No items yet"
            description="Stash your first thing to see it here."
            action={<Button variant="primary">Add an item</Button>}
          />
        </div>

        <div>
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Error</p>
          <EmptyState
            title="Couldn't load items"
            description="Check your connection and try again."
            action={<Button variant="secondary">Retry</Button>}
          />
        </div>
      </section>

      <section aria-labelledby="autocomplete-heading" className="flex flex-col gap-5">
        <h2 id="autocomplete-heading" className="text-base font-semibold text-ink">
          Location autocomplete — states
        </h2>

        <div>
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Success (type &quot;red&quot;)</p>
          <AutocompleteDemo label="Where?" options={locationOptions} />
        </div>

        <div>
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Loading</p>
          <AutocompleteDemo label="Where?" options={locationOptions} isLoading />
        </div>

        <div>
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">
            Empty (no places yet — type to create one)
          </p>
          <AutocompleteDemo label="Where?" options={[]} />
        </div>

        <div>
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Error</p>
          <AutocompleteDemo label="Where?" options={[]} error="Couldn't load your places." />
        </div>
      </section>

      <section aria-labelledby="bottom-nav-heading" className="flex flex-col gap-3">
        <h2 id="bottom-nav-heading" className="text-base font-semibold text-ink">
          Bottom nav
        </h2>
        <p className="text-[11px] text-mid">
          The wireframes draw 3 tabs (Stuff / Activity / Home) and flag the count as an open question. The shipped
          nav (src/lib/nav-tabs.ts, wired into the real app shell) uses 2 — shown below with &quot;Home&quot; dropped.
        </p>
        <div className="max-w-xs overflow-hidden rounded-[8px] border border-line">
          <BottomNav tabs={NAV_TABS} activePath="/" />
        </div>
        <div className="max-w-xs overflow-hidden rounded-[8px] border border-line">
          <BottomNav tabs={NAV_TABS} activePath="/activity" />
        </div>
      </section>
    </main>
  );
}
