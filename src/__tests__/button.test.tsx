import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/button";

test("fires onClick when enabled", async () => {
  const onClick = vi.fn();
  render(<Button onClick={onClick}>Save</Button>);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onClick).toHaveBeenCalledOnce();
});

test("isLoading disables the button and marks it busy, without hiding the label", () => {
  render(<Button isLoading>Saving…</Button>);
  const button = screen.getByRole("button", { name: "Saving…" });
  expect(button.hasAttribute("disabled")).toBe(true);
  expect(button.getAttribute("aria-busy")).toBe("true");
});

test("disabled prevents onClick from firing", async () => {
  const onClick = vi.fn();
  render(
    <Button onClick={onClick} disabled>
      Save
    </Button>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onClick).not.toHaveBeenCalled();
});
