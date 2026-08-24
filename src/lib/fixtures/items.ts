// MOCK DATA — see types.ts. Timestamps are computed relative to "now" so the
// demo route's relative-time badges ("2d", "3w", …) always read correctly,
// no matter when this is viewed.
import type { Item } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

export const ITEMS: Item[] = [
  {
    id: "spare-house-keys",
    locationId: "garage-closet-toolbox-red-box",
    name: "Spare house keys",
    addedBy: "Itamar",
    addedAt: daysAgo(40),
    lastMovedBy: "Maayan",
    lastMovedAt: daysAgo(2),
  },
  {
    id: "passport",
    locationId: "bedroom-filing-box",
    name: "Passport",
    detail: "with the birth certificates",
    addedBy: "Itamar",
    addedAt: daysAgo(21),
    lastMovedAt: daysAgo(21),
  },
  {
    id: "camping-tent",
    locationId: "garage-high-shelf",
    name: "Camping tent",
    addedBy: "Itamar",
    addedAt: daysAgo(22),
    lastMovedAt: daysAgo(22),
  },
  {
    id: "winter-coats",
    locationId: "bedroom-under-bed",
    name: "Winter coats",
    addedBy: "Maayan",
    addedAt: daysAgo(120),
    lastMovedAt: daysAgo(120),
  },
  {
    id: "router-box-and-cables",
    locationId: "office-drawer-2",
    name: "Router box + cables",
    addedBy: "Itamar",
    addedAt: daysAgo(180),
    lastMovedAt: daysAgo(180),
  },
  {
    id: "bike-multi-tool",
    locationId: "garage-closet-toolbox-red-box",
    name: "Bike multi-tool",
    addedBy: "Maayan",
    addedAt: daysAgo(10),
    lastMovedAt: daysAgo(10),
  },
  {
    id: "old-visas-folder",
    locationId: "office-filing-cabinet",
    name: "Old visas folder",
    addedBy: "Itamar",
    addedAt: daysAgo(365),
    lastMovedAt: daysAgo(365),
  },
];
