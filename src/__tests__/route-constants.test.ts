import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { expect, test } from "vitest";

/**
 * The Stuff screen and the site root are named in exactly one place,
 * src/lib/routes.ts (STUFF_PATH, MARKETING_PATH, stuffSearchHref). Before
 * that, "/" meant both, and moving the app off it meant hunting down every
 * `href="/"` by hand. This keeps a new literal from creeping back in, so the
 * next move is a one-line change plus a folder rename. routes.ts lives in
 * src/lib, outside what this scans.
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

const LITERALS: readonly { name: string; pattern: RegExp }[] = [
  // Not PageProps<"/stuff">: Next's generated route types need the literal.
  { name: "a quoted /stuff path", pattern: /(?<!Props<)["'`]\/stuff(?=["'`/?#])/ },
  { name: 'href="/"', pattern: /href=["']\/["']/ },
  { name: "a navigation to a quoted /", pattern: /\b(?:push|replace|redirect)\(\s*["'`]\/["'`]\s*\)/ },
  { name: "a hand-built /?q= link", pattern: /["'`]\/\?q=/ },
];

test("the walk finds the app's source files", () => {
  expect(files.length).toBeGreaterThan(20);
});

test.each(LITERALS)("no component or page spells $name instead of using src/lib/routes.ts", ({ pattern }) => {
  const offenders = files
    .filter((file) => pattern.test(readFileSync(file, "utf8")))
    .map((file) => relative(process.cwd(), file));
  expect(offenders).toEqual([]);
});

test("each pattern catches the literal it's meant to", () => {
  const samples = ['"/stuff"', "'/stuff?q=a'", 'href="/"', 'router.push("/")', "`/?q=${q}`"];
  samples.forEach((sample) => {
    expect(
      LITERALS.some(({ pattern }) => pattern.test(sample)),
      sample,
    ).toBe(true);
  });
  // A bare "/" in a comparison or a path join is fine, and so is a constant.
  expect(LITERALS.some(({ pattern }) => pattern.test('tabHref !== "/"'))).toBe(false);
  expect(LITERALS.some(({ pattern }) => pattern.test("href={STUFF_PATH}"))).toBe(false);
  expect(LITERALS.some(({ pattern }) => pattern.test('PageProps<"/stuff">'))).toBe(false);
});
