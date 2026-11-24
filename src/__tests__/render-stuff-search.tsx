import type { ReactElement } from "react";
import { render, type RenderResult } from "@testing-library/react";
import { RegisterStuffView, StuffViewsShell } from "@/components/stuff-views-shell";

/**
 * Renders a list that reads the search query (StuffSearchResults,
 * BrowseContent) under the real shared header, with the page's data already
 * registered, so the search field is enabled and typing in it drives the
 * list, as on /stuff and /browse.
 */
export function renderUnderStuffHeader(ui: ReactElement): RenderResult {
  return render(
    <StuffViewsShell>
      <RegisterStuffView mode="list" />
      {ui}
    </StuffViewsShell>,
  );
}
