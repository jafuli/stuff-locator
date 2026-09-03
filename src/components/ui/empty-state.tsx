import type { ReactNode } from "react";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Synthesized from the wireframes' two dashed-box patterns (`.empty`, the
 * simple "nothing else close" box, and `.banner`, the richer bold-title
 * variant) into one generic icon/title/description/action primitive. The
 * title renders as a styled paragraph rather than a hardcoded heading level
 * — this is a reusable leaf that doesn't know its caller's document outline.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-[9px] border-[1.5px] border-dashed border-line p-4 text-center">
      {icon ? (
        <div aria-hidden="true" className="mb-2 flex justify-center text-mid">
          {icon}
        </div>
      ) : null}
      <p className="text-[12px] font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 text-[11.5px] text-mid">{description}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
