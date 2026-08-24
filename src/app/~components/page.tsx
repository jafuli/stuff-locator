import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LocationBreadcrumb } from "@/components/location-breadcrumb";
import { ItemCard } from "@/components/item-card";
import { BottomNav, type NavTab } from "@/components/bottom-nav";
import { AutocompleteDemo } from "./autocomplete-demo";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { ITEMS } from "@/lib/fixtures/items";
import { getBreadcrumbNames, getFullLocationPaths } from "@/lib/fixtures/location-path";

// Wireframe literally draws 3 tabs (Stuff / Activity / Home) and its own
// footer calls the count an open question. This task's Acceptance Criteria
// specifies a 2-tab nav, so "Home" (household settings) is dropped here —
// a real divergence from the wireframe's drawing, flagged rather than
// silently decided. See the PR description and the task's Notion Notes.
const NAV_TABS: NavTab[] = [
  { href: "/stuff", label: "Stuff" },
  { href: "/activity", label: "Activity" },
];

const locationOptions = getFullLocationPaths(LOCATIONS);
const pathFor = (locationId: string) => getBreadcrumbNames(locationId, LOCATIONS);

function SkeletonRow() {
  return (
    <div className="animate-pulse border-b border-[#ececec] py-[9px] last:border-b-0">
      <div className="h-[13.5px] w-2/3 rounded bg-wash" />
      <div className="mt-[6px] h-[10.5px] w-1/2 rounded bg-wash" />
    </div>
  );
}

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
        <LocationBreadcrumb path={["Bedroom", "Filing box"]} />
        <div className="max-w-[320px] rounded-[7px] bg-wash p-3">
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Wraps at 320px, never truncates</p>
          <LocationBreadcrumb path={["Garage", "Closet", "Toolbox", "Locked cabinet", "Top shelf", "Red box"]} />
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
              <ItemCard key={item.id} item={item} path={pathFor(item.locationId)} href={`/items/${item.id}`} />
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-[9.5px] tracking-[.06em] text-mid uppercase">Loading</p>
          <div>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
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
          The wireframes draw 3 tabs (Stuff / Activity / Home) and flag the count as an open question. This task&apos;s
          Acceptance Criteria specifies 2 — shown below with &quot;Home&quot; dropped. Flagged for confirmation in the PR,
          not decided silently.
        </p>
        <div className="max-w-xs overflow-hidden rounded-[8px] border border-line">
          <BottomNav tabs={NAV_TABS} activePath="/stuff" />
        </div>
        <div className="max-w-xs overflow-hidden rounded-[8px] border border-line">
          <BottomNav tabs={NAV_TABS} activePath="/activity" />
        </div>
      </section>
    </main>
  );
}
