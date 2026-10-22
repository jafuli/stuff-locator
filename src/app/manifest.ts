import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stuff Locator",
    short_name: "Stuff Locator",
    description: "Find anything in the house in one tap.",
    start_url: "/",
    display: "standalone",
    // A manifest can't follow the OS theme or reference CSS variables, so
    // these are the design system's light-theme `paper`, hard-coded.
    background_color: "#f6f1e7",
    theme_color: "#f6f1e7",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
