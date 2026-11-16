import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

/**
 * Focus rings come from one place: the `focus-ring` / `focus-ring-inset`
 * utilities in globals.css. The old per-component spelling,
 * `outline-none focus-visible:outline-2 …`, rendered no ring at all under
 * Tailwind v4 (outline-none zeroes the variable outline-2 reads), and it
 * passed every check because each copy looked right. This keeps it from
 * coming back.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const SRC = join(process.cwd(), "src");
const files = sourceFiles(join(SRC, "components")).concat(sourceFiles(join(SRC, "app")));

test("no component builds its own focus-visible outline", () => {
  const offenders = files.filter((file) => /focus-visible:-?outline-/.test(readFileSync(file, "utf8")));
  expect(offenders).toEqual([]);
});

test("globals.css defines both ring utilities without reading a Tailwind outline variable", () => {
  const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
  for (const name of ["focus-ring", "focus-ring-inset"]) {
    const start = css.indexOf(`@utility ${name} {`);
    expect(start, `@utility ${name} missing`).toBeGreaterThan(-1);
    const body = css.slice(start, css.indexOf("\n}", start));
    expect(body).toContain("outline: 2px solid var(--focus)");
    expect(body).not.toContain("--tw-outline-style");
  }
});
