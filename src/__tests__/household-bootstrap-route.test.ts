// @vitest-environment node
//
// Route handlers run in a server (Node/edge) runtime, not jsdom — using the
// node environment here keeps the real, unshadowed global Response/Request
// this file's Response.json(...) calls rely on.
import { afterEach, describe, expect, test, vi } from "vitest";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock("@/server/db/server", () => ({
  createClient: () => Promise.resolve({ auth: { getUser } }),
}));

const { ensureHousehold } = vi.hoisted(() => ({ ensureHousehold: vi.fn() }));
vi.mock("@/server/services/household", () => ({ ensureHousehold }));

// Static import is safe here for the same reason as the other mocked
// component tests: vi.mock calls are hoisted above imports.
import { POST } from "@/app/api/household/bootstrap/route";

afterEach(() => {
  getUser.mockReset();
  ensureHousehold.mockReset();
});

describe("POST /api/household/bootstrap", () => {
  test("returns 401 and never calls the service when there is no authenticated user", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(ensureHousehold).not.toHaveBeenCalled();
  });

  test("returns 401 when auth.getUser itself errors", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "no session" } });

    const response = await POST();

    expect(response.status).toBe(401);
    expect(ensureHousehold).not.toHaveBeenCalled();
  });

  test("returns 200 and the service's result on success", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "jane@example.com" } }, error: null });
    ensureHousehold.mockResolvedValue({ ok: true, created: true });

    const response = await POST();
    const body = (await response.json()) as { ok: boolean; created: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, created: true });
    expect(ensureHousehold).toHaveBeenCalledWith(expect.anything(), "u1", "jane@example.com");
  });

  test("returns 500 without leaking the raw error, but logs it", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1", email: "jane@example.com" } }, error: null });
    ensureHousehold.mockResolvedValue({ ok: false, error: "create_household: boom" });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST();
    const body = (await response.json()) as { ok: boolean };

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false });
    expect(JSON.stringify(body)).not.toContain("boom");
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("household-bootstrap"), "create_household: boom");

    consoleError.mockRestore();
  });
});
