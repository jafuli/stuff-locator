import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  /* config options here */
};

// @serwist/next's webpack-plugin approach doesn't run under Turbopack, which
// Next.js 16 uses by default for both `next dev` and `next build`. This is
// the Turbopack-native equivalent: it wires up next.config, and the actual
// service worker is built by the route handler at src/app/serwist/[path]/route.ts.
export default withSerwist(nextConfig);
