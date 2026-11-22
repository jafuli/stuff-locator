import { StuffListSkeleton } from "@/components/stuff-list-skeleton";

// Shown under the shared header (StuffViewsShell) while this page's reads
// run. A loading.tsx, not a Suspense inside the page, so Next can prefetch it
// and switch to it instantly (partial prefetch of a dynamic route).
export default function Loading() {
  return <StuffListSkeleton />;
}
