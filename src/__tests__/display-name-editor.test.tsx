import { beforeEach, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { refresh, update, single } = vi.hoisted(() => ({ refresh: vi.fn(), update: vi.fn(), single: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

// The browser client, faked at the two reads and the one write the editor
// makes: who am I, my profile row, and the update.
vi.mock("@/server/db/client", () => ({
  createClient: () => ({
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "me" } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { display_name: "itamar.badash" } }) }),
      }),
      update: (values: { display_name: string }) => {
        update(values);
        return { eq: () => ({ select: () => ({ single }) }) };
      },
    }),
  }),
}));

import { DisplayNameEditor } from "@/components/display-name-editor";

beforeEach(() => {
  refresh.mockReset();
  update.mockReset();
  single.mockReset();
});

async function renderLoaded() {
  render(<DisplayNameEditor />);
  return screen.findByRole("button", { name: "Edit your name" });
}

test("shows the current name with an edit button", async () => {
  await renderLoaded();
  expect(screen.getByText("itamar.badash")).toBeDefined();
});

test("edit turns the name into a focused field with Save and Cancel; Enter saves and focus returns to edit", async () => {
  single.mockResolvedValue({ data: { display_name: "Itamar" }, error: null });
  const user = userEvent.setup();
  await user.click(await renderLoaded());

  const field = screen.getByLabelText<HTMLInputElement>("Your name");
  expect(document.activeElement).toBe(field);
  expect(field.maxLength).toBe(50);
  expect(screen.getByRole("button", { name: "Save name" })).toBeDefined();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDefined();

  await user.clear(field);
  await user.type(field, "  Itamar {Enter}");

  expect(update).toHaveBeenCalledWith({ display_name: "Itamar" });
  const editButton = await screen.findByRole("button", { name: "Edit your name" });
  expect(screen.getByText("Itamar")).toBeDefined();
  await waitFor(() => {
    expect(document.activeElement).toBe(editButton);
  });
  expect(refresh).toHaveBeenCalled();
});

test("Escape cancels without saving, and never reaches the sheet's own Escape listener", async () => {
  const user = userEvent.setup();
  const onDocumentEscape = vi.fn();
  // Stands in for the Dialog's document-level Escape listener.
  const listener = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      onDocumentEscape();
    }
  };
  document.addEventListener("keydown", listener);
  await user.click(await renderLoaded());

  await user.type(screen.getByLabelText("Your name"), "zzz");
  await user.keyboard("{Escape}");

  expect(update).not.toHaveBeenCalled();
  expect(screen.getByText("itamar.badash")).toBeDefined();
  expect(onDocumentEscape).not.toHaveBeenCalled();
  const editButton = screen.getByRole("button", { name: "Edit your name" });
  await waitFor(() => {
    expect(document.activeElement).toBe(editButton);
  });
  document.removeEventListener("keydown", listener);
});

test("a blank name is refused inline", async () => {
  const user = userEvent.setup();
  await user.click(await renderLoaded());

  await user.clear(screen.getByLabelText("Your name"));
  await user.click(screen.getByRole("button", { name: "Save name" }));

  expect(screen.getByRole("alert").textContent).toBe("Enter your name.");
  expect(update).not.toHaveBeenCalled();
});

test("while saving, the buttons and field are disabled; a failure shows inline and keeps the draft", async () => {
  let resolveSave: (value: unknown) => void = () => undefined;
  single.mockReturnValue(
    new Promise((resolve) => {
      resolveSave = resolve;
    }),
  );
  const user = userEvent.setup();
  await user.click(await renderLoaded());
  const field = screen.getByLabelText<HTMLInputElement>("Your name");
  await user.clear(field);
  await user.type(field, "Noa");
  await user.click(screen.getByRole("button", { name: "Save name" }));

  expect(field.disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Save name" }).disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>("button", { name: "Cancel" }).disabled).toBe(true);

  resolveSave({ data: null, error: { code: "08006", message: "connection failure" } });

  expect(await screen.findByRole("alert")).toBeDefined();
  expect(screen.getByRole("alert").textContent).toMatch(/couldn't be saved/);
  expect(field.value).toBe("Noa");
  expect(refresh).not.toHaveBeenCalled();
});
