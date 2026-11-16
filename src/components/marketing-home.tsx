import Link from "next/link";
import { ItemCard } from "@/components/item-card";
import { SiteHeader, STANDALONE_PAGE_CLASSES } from "@/components/site-header";
import { RESULT_LIST_PANEL_CLASSES, type StuffListEntry } from "@/components/stuff-list";
import { buttonClassName } from "@/components/ui/button";
import { textLinkClassName } from "@/components/ui/text-link";

const DAY_MS = 24 * 60 * 60 * 1000;

const HOW_IT_WORKS = [
  {
    title: "Stash it",
    meta: "Name the thing and where it went: a room, a container, a note if you want one.",
  },
  {
    title: "Find it",
    meta: "Search by whatever you call it today. “Travel documents” still finds the passports.",
  },
  {
    title: "Shared with your partner",
    meta: "One list for the two of you, and a feed of who moved what.",
  },
] as const;

/**
 * The "For example" rows. Hard-coded on purpose: no Supabase call, no
 * session. The dates are offsets from `now` rather than fixed days, so the
 * meta line keeps reading "3 days ago" instead of slowly going stale. 125
 * days rather than 120 so "4 months ago" (30-day months in
 * formatRelativeLong) doesn't sit on a boundary.
 */
export function demoEntries(now: Date): StuffListEntry[] {
  const daysAgo = (days: number) => new Date(now.getTime() - days * DAY_MS);
  return [
    {
      item: {
        id: "demo-passports",
        locationId: "demo-top-drawer",
        name: "Passports (both)",
        detail: "In the blue folder",
        lastMovedAt: daysAgo(3),
      },
      segments: [
        { id: "demo-bedroom", name: "Bedroom" },
        { id: "demo-desk", name: "Desk" },
        { id: "demo-top-drawer", name: "Top drawer" },
      ],
      byName: "Noa",
    },
    {
      item: { id: "demo-car-key", locationId: "demo-small-tin", name: "Spare car key", lastMovedAt: daysAgo(14) },
      segments: [
        { id: "demo-hallway", name: "Hallway" },
        { id: "demo-shoe-cabinet", name: "Shoe cabinet" },
        { id: "demo-small-tin", name: "Small tin" },
      ],
      byName: "Dan",
    },
    {
      item: { id: "demo-stove", locationId: "demo-red-box", name: "Camping stove", lastMovedAt: daysAgo(125) },
      segments: [
        { id: "demo-garage", name: "Garage" },
        { id: "demo-closet", name: "Closet" },
        { id: "demo-red-box", name: "Red box" },
      ],
      byName: "Noa",
    },
  ];
}

export interface MarketingHomeProps {
  /** The moment the sample rows' "3 days ago" is measured from. Defaults to the render time. */
  now?: Date;
}

/**
 * What a signed-out visitor sees at "/" (src/app/page.tsx renders it when
 * there's no user; the Stuff screen otherwise). Layout agreed in the Notion
 * task on 2026-11-15: wordmark + Sign in, the one display question, the
 * pitch, Sign up, "How it works", and three sample result rows — and it
 * ends there, no repeated call to action.
 *
 * data-without-app-shell hides the floating nav (see globals.css): "/" is
 * also the signed-in Stuff screen, so the nav can't decide by pathname.
 */
export function MarketingHome({ now = new Date() }: MarketingHomeProps) {
  return (
    <div data-without-app-shell className={STANDALONE_PAGE_CLASSES}>
      <SiteHeader
        action={
          <Link href="/sign-in" className={textLinkClassName()}>
            Sign in
          </Link>
        }
      />

      <main className="flex flex-col gap-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-display text-ink">Where did we put the passports?</h1>
          <p className="text-body text-muted">
            A shared list of the 20–50 hard-to-find things you and your partner keep at home, and exactly where each one
            is. Stash it once, then find it by whatever you call it that day.
          </p>
          <Link href="/sign-up" className={buttonClassName("primary", "self-start")}>
            Sign up
          </Link>
        </div>

        <section aria-labelledby="how-it-works" className="flex flex-col gap-2">
          <h2 id="how-it-works" className="text-section-label text-muted">
            How it works
          </h2>
          <ul className="flex flex-col gap-4">
            {HOW_IT_WORKS.map((point) => (
              <li key={point.title} className="flex flex-col gap-0.5">
                <span className="text-title text-ink">{point.title}</span>
                <span className="text-meta text-muted">{point.meta}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="for-example" className="flex flex-col gap-2">
          <h2 id="for-example" className="text-section-label text-muted">
            For example
          </h2>
          {/* Flat siblings, not <li>s — ItemCard's last:border-b-0 needs true
              sibling position (see StuffList). No href: these rows illustrate,
              they don't open anything. */}
          <div className={RESULT_LIST_PANEL_CLASSES}>
            {demoEntries(now).map(({ item, segments, byName }) => (
              <ItemCard key={item.id} item={item} segments={segments} byName={byName} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
