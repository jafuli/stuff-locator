import { describe, expect, test, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { HOUSEHOLD_FULL_MESSAGE, redeemInviteAndGetHouseholdName } from "@/lib/redeem-invite-client";

function fakeClient(rpcError: { message: string; code: string }): {
  client: SupabaseClient<Database>;
  from: ReturnType<typeof vi.fn>;
} {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: rpcError });
  return { client: { from, rpc } as unknown as SupabaseClient<Database>, from };
}

describe("redeemInviteAndGetHouseholdName", () => {
  test("a full household (SL005) gets its own copy, without the already-a-member fallback read", async () => {
    const { client, from } = fakeClient({ message: "redeem_invite: household full", code: "SL005" });

    const result = await redeemInviteAndGetHouseholdName(client, "abc123");

    expect(result).toEqual({ ok: false, error: HOUSEHOLD_FULL_MESSAGE });
    expect(from).not.toHaveBeenCalled();
  });

  test("any other refusal still reports the database's message", async () => {
    const { client } = fakeClient({ message: "redeem_invite: invite not found", code: "P0001" });

    const result = await redeemInviteAndGetHouseholdName(client, "nope");

    expect(result).toEqual({ ok: false, error: "redeem_invite: invite not found" });
  });
});
