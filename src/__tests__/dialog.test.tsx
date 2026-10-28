import { useState } from "react";
import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "@/components/ui/dialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Are you sure?"
      >
        <button type="button">First</button>
        <button type="button">Last</button>
      </Dialog>
    </>
  );
}

test("renders nothing while closed", () => {
  render(<Harness />);
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("opens as a labelled modal dialog and moves focus inside", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "Open" }));

  const dialog = screen.getByRole("dialog", { name: "Are you sure?" });
  expect(dialog.getAttribute("aria-modal")).toBe("true");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
});

test("Tab and Shift+Tab wrap inside the dialog instead of leaving it", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Open" }));

  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }));
  await user.tab();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Last" }));
});

test("Escape closes it and focus returns to the control that opened it", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Open" });
  await user.click(opener);

  await user.keyboard("{Escape}");

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(opener);
});

test("a tap on the scrim closes it", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Open" }));

  await user.click(screen.getByRole("button", { name: "Close dialog" }));

  expect(screen.queryByRole("dialog")).toBeNull();
});

test("the sheet variant keeps the same modal behaviour: labelled, focus inside, Escape closes", async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <Dialog open onClose={onClose} title="Household" variant="sheet">
      <button type="button">Row</button>
    </Dialog>,
  );
  expect(screen.getByRole("dialog", { name: "Household" })).toBeDefined();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Row" }));
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledOnce();
});
