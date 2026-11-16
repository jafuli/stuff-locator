import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { SiteHeader } from "@/components/site-header";
import { textLinkClassName } from "@/components/ui/text-link";

test("with homeLink, the wordmark is a link to /", () => {
  render(<SiteHeader homeLink />);
  expect(screen.getByRole("link", { name: "Stuff Locator" }).getAttribute("href")).toBe("/");
});

test("without homeLink, the wordmark is plain text (on / itself, a link would point at the page you're on)", () => {
  render(<SiteHeader />);
  expect(screen.getByText("Stuff Locator")).toBeDefined();
  expect(screen.queryByRole("link")).toBeNull();
});

test("renders the action slot in the same header landmark", () => {
  render(<SiteHeader action={<a href="/sign-in">Sign in</a>} />);
  expect(screen.getByRole("banner").textContent).toContain("Sign in");
});

test("textLinkClassName can drop the underline but keeps the tap target", () => {
  const classes = textLinkClassName({ underline: false }).split(" ");
  expect(classes).not.toContain("underline");
  expect(classes).toContain("min-h-target-min");
  expect(textLinkClassName().split(" ")).toContain("underline");
});
