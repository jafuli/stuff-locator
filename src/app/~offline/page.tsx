export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground">
        Stuff Locator needs a connection for this page. Anything you&apos;ve already loaded is still available.
      </p>
    </main>
  );
}
