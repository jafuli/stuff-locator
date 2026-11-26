import Link from "next/link";
import { ItemCard } from "@/components/item-card";
import { SiteHeader } from "@/components/site-header";
import { RESULT_LIST_PANEL_CLASSES, type StuffListEntry } from "@/components/stuff-list";
import { buttonClassName } from "@/components/ui/button";
import { textLinkClassName } from "@/components/ui/text-link";

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

/** The "For example" rows. Hard-coded on purpose: no Supabase call, no session. */
export function demoEntries(): StuffListEntry[] {
  return [
    {
      item: {
        id: "demo-passports",
        locationId: "demo-top-drawer",
        name: "Passports (both)",
        detail: "In the blue folder",
      },
      segments: [
        { id: "demo-bedroom", name: "Bedroom" },
        { id: "demo-desk", name: "Desk" },
        { id: "demo-top-drawer", name: "Top drawer" },
      ],
    },
    {
      item: { id: "demo-car-key", locationId: "demo-small-tin", name: "Spare car key" },
      segments: [
        { id: "demo-hallway", name: "Hallway" },
        { id: "demo-shoe-cabinet", name: "Shoe cabinet" },
        { id: "demo-small-tin", name: "Small tin" },
      ],
    },
    {
      item: { id: "demo-stove", locationId: "demo-red-box", name: "Camping stove" },
      segments: [
        { id: "demo-garage", name: "Garage" },
        { id: "demo-closet", name: "Closet" },
        { id: "demo-red-box", name: "Red box" },
      ],
    },
  ];
}

/**
 * What a signed-out visitor sees at the site root, "/"
 * (src/app/(public)/page.tsx); a signed-in visitor is redirected to the Stuff
 * screen instead. The (public) layout supplies the column with no floating
 * nav (ADR 0013).
 * Layout agreed in the Notion task on 2026-11-15: wordmark + Sign in, the
 * one display question, the pitch, Sign up, "How it works", and three
 * sample result rows — and it ends there, no repeated call to action.
 */
export function MarketingHome() {
  return (
    <>
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
            {demoEntries().map(({ item, segments }) => (
              <ItemCard key={item.id} item={item} segments={segments} />
            ))}
          </div>
        </section>
      </main>
    </>
  );
}
