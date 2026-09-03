// MOCK DATA — see types.ts. Reproduces the actual paths drawn in the
// wireframes (garage → closet → toolbox → red box, etc.) so the components
// built against this fixture set are exercised with the same paths a
// reviewer will recognise from the design.
import type { Location } from "./types";

export const LOCATIONS: Location[] = [
  { id: "garage", parentId: null, name: "Garage" },
  { id: "garage-high-shelf", parentId: "garage", name: "High shelf" },
  { id: "garage-closet", parentId: "garage", name: "Closet" },
  { id: "garage-closet-toolbox", parentId: "garage-closet", name: "Toolbox" },
  { id: "garage-closet-toolbox-red-box", parentId: "garage-closet-toolbox", name: "Red box" },
  { id: "garage-behind-the-bikes", parentId: "garage", name: "Behind the bikes" },

  { id: "office", parentId: null, name: "Office" },
  { id: "office-red-folder-tray", parentId: "office", name: "Red folder tray" },
  { id: "office-filing-cabinet", parentId: "office", name: "Filing cabinet" },
  { id: "office-drawer-2", parentId: "office", name: "Drawer 2" },

  { id: "bedroom", parentId: null, name: "Bedroom" },
  { id: "bedroom-filing-box", parentId: "bedroom", name: "Filing box" },
  { id: "bedroom-under-bed", parentId: "bedroom", name: "Under bed" },

  { id: "kitchen", parentId: null, name: "Kitchen" },
  { id: "kitchen-drawer-1", parentId: "kitchen", name: "Drawer 1" },
];
