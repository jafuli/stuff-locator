import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PathTrail } from "@/components/path-trail";
import { StuffList } from "@/components/stuff-list";
import { StuffViewChips } from "@/components/stuff-view-chips";
import { ItemCardSkeleton } from "@/components/item-card-skeleton";
import { TabCapsule } from "@/components/tab-capsule";
import { PathPickerDemo } from "./path-picker-demo";
import { DialogDemo, FormFieldDemo, HouseholdSheetDemo, StuffSearchDemo } from "./primitive-demos";
import { LOCATIONS } from "@/lib/fixtures/locations";
import { ITEMS } from "@/lib/fixtures/items";
import { getBreadcrumbSegments } from "@/lib/fixtures/location-path";
import { NAV_TABS } from "@/lib/nav-tabs";

const segmentsFor = (locationId: string) => getBreadcrumbSegments(locationId, LOCATIONS);

const COLOR_TOKENS = [
  ["paper", "bg-paper"],
  ["surface", "bg-surface"],
  ["ink", "bg-ink"],
  ["muted", "bg-muted"],
  ["faint", "bg-faint"],
  ["hairline", "bg-hairline"],
  ["divider", "bg-divider"],
  ["border-control", "bg-border-control"],
  ["border-strong", "bg-border-strong"],
  ["signal", "bg-signal"],
  ["tape", "bg-tape"],
  ["on-tape", "bg-on-tape"],
  ["focus", "bg-focus"],
] as const;

const TYPE_STYLES = [
  ["display", "text-display text-ink", "What are you looking for?"],
  ["title", "text-title text-ink", "Spare house key"],
  ["body", "text-body text-ink", "Inputs, detail text, sheets."],
  ["meta", "text-meta text-muted", "Noa, 3 days ago"],
  ["nav", "text-nav text-ink", "Activity"],
  ["path", "text-path text-muted", "Bedroom › Desk › Top drawer"],
  ["section-label", "text-section-label text-muted", "Best matches"],
  ["marker", "text-marker text-signal", "Closest"],
  ["logo-tape", "text-logo-tape bg-ink text-paper px-2 py-1 inline-block", "Stuff Locator"],
] as const;

/**
 * Renders its children twice — once pinned to each theme — so every
 * primitive can be checked in light and dark without flipping the OS
 * setting. `data-theme` re-declares the colour tokens for the subtree (see
 * globals.css), so these panes are real renderings, not screenshots.
 */
function ThemePair({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(["light", "dark"] as const).map((theme) => (
        <div
          key={theme}
          data-theme={theme}
          className="flex flex-col gap-4 rounded-panel border border-hairline bg-paper p-4 text-ink"
        >
          <p className="text-section-label text-muted">{theme}</p>
          {children}
        </div>
      ))}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-title text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function ComponentsDemoPage() {
  // Dev-only. This catalog exists for whoever is building the primitives,
  // and it has no audience on a deployed build: it's unlinked, so nobody
  // finds it without being handed the URL, and what it renders is fixture
  // data, not anything a visitor would want. It's also gated behind a
  // session by the proxy (src/lib/route-access.ts) like every other
  // non-auth route — this is the second, narrower gate, cutting it out of
  // deployed builds entirely.
  //
  // NODE_ENV, not VERCEL_ENV: nothing is deployed yet, so keying off a
  // Vercel-only variable would be a rule that can't be tested. The
  // trade-off is that `npm run build && npm run start` 404s here too,
  // including Playwright's own webServer — deliberate, and no spec visits
  // this route.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-8 sm:px-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-display text-ink">Component catalog</h1>
        <p className="text-body text-muted">
          The Label Maker design system as built: tokens, type, and the shared primitives, each shown in both themes
          side by side. Unlinked and dev-only, like <code>/~offline</code> is unlinked.
        </p>
      </div>

      <Section id="color-heading" title="Color tokens">
        <ThemePair>
          <ul className="grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            {COLOR_TOKENS.map(([name, swatch]) => (
              <li key={name} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`${swatch} size-8 shrink-0 rounded-control border border-hairline`}
                />
                <span className="text-meta text-ink">{name}</span>
              </li>
            ))}
          </ul>
        </ThemePair>
      </Section>

      <Section id="type-heading" title="Type styles">
        <ThemePair>
          <ul className="flex flex-col gap-3">
            {TYPE_STYLES.map(([name, classes, sample]) => (
              <li key={name} className="flex flex-col gap-1">
                <span className="text-meta text-muted">{name}</span>
                <span className={classes}>{sample}</span>
              </li>
            ))}
          </ul>
        </ThemePair>
      </Section>

      <Section id="elevation-heading" title="Radius and shadow">
        <ThemePair>
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-meta bg-tape text-on-tape shadow-tape inline-flex h-tape-height items-center rounded-tape px-2">
              tape
            </span>
            <span className="text-meta flex size-16 items-center justify-center rounded-control bg-surface text-ink shadow-control">
              control
            </span>
            <span className="text-meta flex size-16 items-center justify-center rounded-panel border border-hairline bg-surface text-ink">
              panel
            </span>
            <span className="text-meta flex h-16 w-24 items-center justify-center rounded-capsule bg-surface text-ink shadow-float">
              capsule
            </span>
          </div>
        </ThemePair>
      </Section>

      <Section id="button-heading" title="Button">
        <ThemePair>
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
        </ThemePair>
      </Section>

      <Section id="form-field-heading" title="Form field">
        <ThemePair>
          <FormFieldDemo />
        </ThemePair>
      </Section>

      <Section id="dialog-heading" title="Dialog">
        <ThemePair>
          <div>
            <DialogDemo label="Open dialog" />
          </div>
        </ThemePair>
      </Section>

      <Section id="empty-state-heading" title="Empty state">
        <ThemePair>
          <EmptyState
            title="No items yet"
            description="Stash your first thing to see it here."
            action={<Button variant="primary">Add an item</Button>}
          />
          <EmptyState title="Couldn't load items" description="Check your connection and try again." />
        </ThemePair>
      </Section>

      <Section id="tab-capsule-heading" title="Tab capsule">
        <ThemePair>
          <TabCapsule tabs={NAV_TABS} activePath="/" />
          <TabCapsule tabs={NAV_TABS} activePath="/activity" />
        </ThemePair>
      </Section>

      <Section id="household-sheet-heading" title="Household button and sheet">
        <ThemePair>
          <HouseholdSheetDemo />
        </ThemePair>
      </Section>

      <div className="flex flex-col gap-2 border-t border-divider pt-8">
        <h2 className="text-title text-ink">Not yet migrated</h2>
        <p className="text-meta text-muted">
          The components below still use the wireframe styling (through the temporary token aliases). Design 2/5–5/5
          replace them one by one.
        </p>
      </div>

      <Section id="path-trail-heading" title="Path trail">
        <ThemePair>
          <PathTrail
            segments={[
              { id: "bedroom", name: "Bedroom" },
              { id: "desk", name: "Desk" },
              { id: "top-drawer", name: "Top drawer" },
            ]}
          />
          <PathTrail
            segments={[
              { id: "garage", name: "Garage" },
              { id: "garage-closet", name: "Closet" },
              { id: "garage-closet-toolbox", name: "Toolbox" },
              { id: "garage-closet-toolbox-locked-cabinet", name: "Locked cabinet" },
              { id: "garage-closet-toolbox-locked-cabinet-top-shelf", name: "Top shelf" },
              { id: "garage-closet-toolbox-locked-cabinet-top-shelf-red-box", name: "Red box" },
            ]}
            linked
          />
          <PathTrail segments={[{ id: "kitchen", name: "Kitchen" }]} />
          <PathTrail
            segments={[
              { id: "bedroom", name: "Bedroom" },
              { id: "filing-box", name: "Filing box" },
            ]}
            printIn
          />
        </ThemePair>
      </Section>

      <Section id="search-heading" title="Search field and view chips">
        <ThemePair>
          <StuffSearchDemo />
          <StuffViewChips total={5} active="all" />
          <StuffViewChips total={5} active="place" />
        </ThemePair>
      </Section>

      <Section id="result-list-heading" title="Result list">
        <ThemePair>
          <StuffList
            entries={ITEMS.slice(0, 3).map((item, index) => ({
              item,
              segments: segmentsFor(item.locationId),
              byName: index === 0 ? "Noa" : undefined,
            }))}
            linkLocationSegments
            markClosest
          />
          <div className="overflow-hidden rounded-panel border border-hairline bg-surface">
            <ItemCardSkeleton />
            <ItemCardSkeleton />
          </div>
        </ThemePair>
      </Section>

      <Section id="path-picker-heading" title="Location path picker — states">
        <div>
          <p className="mb-1 text-meta text-muted">
            Existing places (type &quot;red&quot;, pick one, then keep typing inside it)
          </p>
          <PathPickerDemo label="Location" locations={LOCATIONS} />
        </div>
        <div>
          <p className="mb-1 text-meta text-muted">Empty household (everything you build is a dashed, new chip)</p>
          <PathPickerDemo label="Location" locations={[]} placeholder="e.g. Office, then Cabinet…" />
        </div>
        <div>
          <p className="mb-1 text-meta text-muted">
            Pick-only (no &quot;+ New&quot; row; Garage and everything inside it excluded)
          </p>
          <PathPickerDemo label="Move into…" locations={LOCATIONS} pickOnly excludeIds={["garage"]} />
        </div>
      </Section>
    </main>
  );
}
