import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import { SiteNav } from "@/components/site-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/*
        Fixed-height flex column so BottomNav (rendered via SiteNav below)
        pins to the bottom of the viewport instead of getting pushed below
        the fold by page content — the content area scrolls independently.
        This also affects /~offline and /~components (both wired here at
        the true root layout, not scoped to just / and /activity) — their
        own <main>s still use min-h-dvh, which now leaves harmless extra
        scroll slack on those two secondary/debug routes; flagged in the PR
        rather than reworked here to keep the diff scoped to the real
        Stuff/Activity flow.
      */}
      <body className="flex h-dvh flex-col overflow-hidden">
        <SerwistProvider swUrl="/serwist/sw.js">
          <div className="flex-1 overflow-y-auto">{children}</div>
          <SiteNav />
        </SerwistProvider>
      </body>
    </html>
  );
}
