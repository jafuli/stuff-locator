import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next, IBM_Plex_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
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
        Fixed-height flex column with one scrolling content area, shared by
        every page. Which frame a page gets is decided one level down, by
        route group (ADR 0013): (app)/layout.tsx adds the floating nav and
        its clearance (it's position: fixed, so it pins to the viewport, not
        this scroller); (public)/layout.tsx adds the standalone column.
        /~offline sizes itself with min-h-full minus the nav clearance rather
        than min-h-dvh, which would overflow this already-constrained
        container (see ~offline/page.tsx).
      */}
      <body className="flex h-dvh flex-col overflow-hidden">
        <SerwistProvider swUrl="/serwist/sw.js">
          <div className="flex-1 overflow-y-auto">{children}</div>
        </SerwistProvider>
      </body>
    </html>
  );
}
