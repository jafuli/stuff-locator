/** Loading placeholder for one ItemCard row. Shape matches ItemCard's two text lines. */
export function ItemCardSkeleton() {
  return (
    <div className="animate-pulse border-b border-[#ececec] py-[9px] last:border-b-0">
      <div className="h-[13.5px] w-2/3 rounded bg-wash" />
      <div className="mt-[6px] h-[10.5px] w-1/2 rounded bg-wash" />
    </div>
  );
}
