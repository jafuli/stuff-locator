import type { ReactNode } from "react";

export type EmptyStateTitleTag = "p" | "h1" | "h2" | "h3";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  /**
   * Renders `title` as this element instead of the default `<p>`. Opt-in
   * only — a caller whose page already has a heading elsewhere in its
   * outline (e.g. StuffList's zero-items branch, under page.tsx's own
   * "Our stuff" <h1>) should leave this unset, since EmptyState itself
   * can't know whether supplying one would duplicate or misplace the
   * page's real heading. Use it when EmptyState is a page's *only*
   * content and nothing else in the tree supplies a heading (e.g. an
   * error or not-found boundary) — see error.tsx / not-found.tsx call
   * sites. Omitting this prop keeps every existing caller's rendered
   * output byte-for-byte unchanged.
   */
  titleAs?: EmptyStateTitleTag;
}

/**
 * Synthesized from the wireframes' two dashed-box patterns (`.empty`, the
 * simple "nothing else close" box, and `.banner`, the richer bold-title
 * variant) into one generic icon/title/description/action primitive. The
 * title renders as a styled paragraph by default — this is a reusable leaf
 * that doesn't know its caller's document outline — but a caller that is
 * its page's only content can opt into a real heading via `titleAs`.
 */
export function EmptyState({ icon, title, description, action, titleAs: TitleTag = "p" }: EmptyStateProps) {
  return (
    <div className="rounded-[9px] border-[1.5px] border-dashed border-line p-4 text-center">
      {icon ? (
        <div aria-hidden="true" className="mb-2 flex justify-center text-mid">
          {icon}
        </div>
      ) : null}
      <TitleTag className="text-[12px] font-semibold text-ink">{title}</TitleTag>
      {description ? <p className="mt-1 text-[11.5px] text-mid">{description}</p> : null}
      {action ? <div className="mt-3 flex justify-center">{action}</div> : null}
    </div>
  );
}
