import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * The design system's contrast promises, checked against the tokens actually
 * shipped in globals.css (parsed, not copied) — so editing a hex there can't
 * quietly break "text passes 4.5:1 in both themes".
 */
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

function tokensIn(blockStart: string): Map<string, string> {
  const start = css.indexOf(blockStart);
  expect(start, `block ${blockStart} not found`).toBeGreaterThan(-1);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const tokens = new Map<string, string>();
  for (const match of body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6});/gi)) {
    tokens.set(match[1], match[2]);
  }
  return tokens;
}

const THEMES = {
  light: tokensIn(':root,\n[data-theme="light"]'),
  dark: tokensIn('[data-theme="dark"]'),
} as const;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// [foreground, background, minimum ratio]
const TEXT_PAIRS: [string, string, number][] = [
  ["ink", "paper", 4.5],
  ["ink", "surface", 4.5],
  ["muted", "paper", 4.5],
  ["muted", "surface", 4.5],
  ["signal", "paper", 4.5],
  ["signal", "surface", 4.5],
  ["on-tape", "tape", 4.5],
  // Inverted elements: ink fill with paper text.
  ["paper", "ink", 4.5],
  // Non-text: a control's only edge and the focus ring need 3:1.
  ["border-strong", "surface", 3],
  ["border-strong", "paper", 3],
  ["focus", "paper", 3],
  ["focus", "surface", 3],
];

describe.each(Object.entries(THEMES))("%s theme", (_name, tokens) => {
  test("defines all 13 color tokens", () => {
    for (const token of [
      "paper",
      "surface",
      "ink",
      "muted",
      "faint",
      "hairline",
      "divider",
      "border-control",
      "border-strong",
      "signal",
      "tape",
      "on-tape",
      "focus",
    ]) {
      expect(tokens.has(token), `--${token}`).toBe(true);
    }
  });

  test.each(TEXT_PAIRS)("%s on %s is at least %s:1", (fg, bg, minimum) => {
    const ratio = contrast(tokens.get(fg) ?? "", tokens.get(bg) ?? "");
    expect(ratio).toBeGreaterThanOrEqual(minimum);
  });
});

test("the prefers-color-scheme dark block matches the data-theme dark block", () => {
  const media = tokensIn(':root:not([data-theme="light"])');
  expect(Object.fromEntries(media)).toEqual(Object.fromEntries(THEMES.dark));
});
