import { StuffListSkeleton } from "@/components/stuff-list-skeleton";

// Shown under the shared header (StuffViewsShell) while this page's reads
// run. The same skeleton as the Stuff screen's, so switching All / By place
// shows one consistent loading state.
export default function Loading() {
  return <StuffListSkeleton />;
}
