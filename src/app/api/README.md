# src/app/api

The HTTP boundary. Route handlers here do exactly three things:

1. Parse and validate the request (Zod schemas from `src/lib`)
2. Authorise the caller
3. Call a function in `src/server/services` and map its result/errors to a response

No business logic lives here — that belongs in `src/server/services`. No direct Supabase calls either; go through the service layer.

Empty for now. This fills in during a Pair session, alongside the data layer it depends on (see `supabase/migrations/`).
