import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, IBM_Plex_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { NavClearance, SiteNav } from "@/components/site-nav";
import "./globals.css";

// The design system's two families. Weights are exactly what the type styles
// use — 400/500/600 sans, 500 mono — so a stray font-bold can't render a
// weight the brand book rules out (it would be synthesised, not loaded).
const atkinson = Atkinson_Hyperlegible_Next({
  variable: "--font-atkinson",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: "500",
});

export const metadata: Metadata = {
  title: "Stuff Locator",
  description: "Find anything in the house in one tap.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Stuff Locator",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // The one place the tokens can't be referenced: a <meta> tag has no CSS
  // variables. These are the design system's `paper` in each theme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e7" },
    { media: "(prefers-color-scheme: dark)", color: "#17140f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${atkinson.variable} ${plexMono.variable} h-full antialiased`}>
      {/*
        Fixed-height flex column so BottomNav (rendered via SiteNav below)
        pins to the bottom of the viewport instead of getting pushed below
        the fold by page content — the content area scrolls independently.
        This also affects /~offline and /~components (both wired here at
        the true root layout, not scoped to just / and /activity). /~offline
        used to leave extra scroll slack under this shell (its own <main>
        used min-h-dvh, forcing a full viewport height on top of this
        already-constrained container) — fixed in ~offline/page.tsx
        (min-h-full instead). /~components never had the same issue — its
        content naturally scrolls within this shared container.
      */}
      <body className="flex h-dvh flex-col overflow-hidden">
        <SerwistProvider swUrl="/serwist/sw.js">
          <div className="flex-1 overflow-y-auto">
            {children}
            <NavClearance />
          </div>
          <SiteNav />
        </SerwistProvider>
      </body>
    </html>
  );
}
