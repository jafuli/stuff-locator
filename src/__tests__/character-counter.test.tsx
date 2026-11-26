import { useState } from "react";
import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FormField } from "@/components/ui/form-field";

function Field({ initial = "", max = 80 }: { initial?: string; max?: number }) {
  const [value, setValue] = useState(initial);
  return <FormField id="name" label="Name" type="text" value={value} onChange={setValue} maxLength={max} />;
}

test("below 90% of the limit there is no counter at all", () => {
  render(<Field initial={"a".repeat(71)} />);
  expect(screen.queryByText(/\/ 80/)).toBeNull();
  expect(screen.getByLabelText("Name").getAttribute("aria-describedby")).toBeNull();
});

test("from 90% a quiet 'n / max' appears, hidden from screen readers", async () => {
  const user = userEvent.setup();
  render(<Field initial={"a".repeat(71)} />);

  await user.type(screen.getByLabelText("Name"), "a");

  const counter = screen.getByText("72 / 80");
  expect(counter.getAttribute("aria-hidden")).toBe("true");
  expect(document.querySelector("[aria-live='polite']")?.textContent).toBe("");
});

test("typing stops at the limit, and only then do screen readers hear it", async () => {
  const user = userEvent.setup();
  render(<Field initial={"a".repeat(79)} />);
  const field = screen.getByLabelText<HTMLInputElement>("Name");

  await user.type(field, "bcd");

  expect(field.value).toHaveLength(80);
  expect(field.maxLength).toBe(80);
  expect(screen.getByText("80 / 80")).toBeDefined();
  const live = document.querySelector("[aria-live='polite']");
  expect(live?.textContent).toBe("Limit reached: 80 of 80 characters.");
  expect(field.getAttribute("aria-describedby")).toBe(live?.id);
});

test("a long paste is cut at the limit, and the counter shows it", async () => {
  const user = userEvent.setup();
  render(<Field max={50} />);
  const field = screen.getByLabelText<HTMLInputElement>("Name");

  await user.click(field);
  await user.paste("x".repeat(120));

  expect(field.value).toHaveLength(50);
  expect(screen.getByText("50 / 50")).toBeDefined();
});
