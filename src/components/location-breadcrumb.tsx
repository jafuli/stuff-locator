export interface LocationBreadcrumbProps {
  /** Already-resolved root→leaf segment names, e.g. ["Garage", "Closet", "Toolbox", "Red box"]. */
  path: string[];
}

/**
 * Renders a full location path, inline, the way it appears on item rows in
 * the wireframes (`Garage › Closet › Toolbox › Red box`). Deliberately never
 * truncates: no `truncate`/`overflow-hidden`/`whitespace-nowrap` anywhere,
 * so a long path wraps onto more lines instead of being cut off — the full
 * path is the actual answer to "where is it?", and hiding part of it would
 * defeat the point.
 */
export function LocationBreadcrumb({ path }: LocationBreadcrumbProps) {
  if (path.length === 0) {
    return null;
  }

  return (
    <p className="font-wire-mono text-[10.5px] tracking-[-0.01em] text-mid">{path.join(" › ")}</p>
  );
}
