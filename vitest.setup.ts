// Runs the DOM cleanup React Testing Library needs between tests. Vitest
// doesn't inject global test hooks by default (this repo doesn't set
// `test.globals: true`), so RTL's automatic afterEach-based cleanup never
// fires without this — every test in a multi-test file would otherwise
// leave its render mounted for the next one.
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
