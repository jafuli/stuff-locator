# src/server/services

Validation, authorisation, and orchestration for anything that isn't a plain read. Reads go direct via PostgREST from `src/app` — nothing needed here for those.

For writes that carry invariants (moving an item, moving or deleting a container, redeeming an invite), the service function calls a Postgres RPC — `move_item`, `move_container`, `delete_container`, `redeem_invite` — via `.rpc()`. Those functions live in `supabase/migrations/`, not here: `supabase-js` talks to PostgREST, which wraps each HTTP call in its own transaction, so a plain SDK call sequence (update item, then insert activity row) can't be atomic. The RPC function *is* the transaction. This layer's job is validating the request and calling the function — not re-implementing what the function guarantees.

Empty for now — this, and the migrations it depends on, is Pair-session work (see the working agreement in `CLAUDE.md`).
