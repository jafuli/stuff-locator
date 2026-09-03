// Minimal placeholder so /activity is a real destination rather than a dead
// link — the real "catch up" activity feed (wireframe screen 07) is a
// separate future task. No data fetching happens here, so there's no
// loading/error boundary to write for this route.
export default function ActivityPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-[16px] font-semibold text-ink">Activity</h1>
      <p className="text-[12.5px] text-mid">Coming soon — this is where you&apos;ll catch up on who moved what.</p>
    </main>
  );
}
