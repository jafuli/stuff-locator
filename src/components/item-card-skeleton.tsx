/** Loading placeholder for one ItemCard row. Shape matches ItemCard's title, path and meta lines. */
export function ItemCardSkeleton() {
  return (
    <div className="flex min-h-14 animate-pulse flex-col gap-2 border-b border-divider px-4 py-3 last:border-b-0">
      <div className="h-[17px] w-2/3 rounded-tape bg-divider" />
      <div className="h-[11.5px] w-1/2 rounded-tape bg-divider" />
    </div>
  );
}
