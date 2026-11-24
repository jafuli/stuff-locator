// npm run measure:db — measures what a household really costs in Postgres
// (ADR 0015, Notion "Household limits … (+ measured capacity)").
//
// Runs against the LOCAL Supabase stack only (`supabase start`); it never
// touches production. Per-row sizes don't depend on the host, so local
// numbers carry over; production's own baseline (`select
// pg_database_size(current_database())` right after the first db push) is a
// manual step, because it tells us how much of the 500 MB is already taken.
//
// What it does, re-runnably:
//   1. measures every public table and the auth tables a user touches
//      (scripts/measure-db/sizes.sql), after VACUUM ANALYZE;
//   2. creates couples through the Auth Admin API and signs each person in
//      once (so auth.users, identities, sessions, refresh_tokens and
//      audit_log_entries grow as they would), then makes each household the
//      way the app does: create_household, create_invite, redeem_invite;
//   3. seeds through the real write functions, AS `authenticated` with the
//      user's JWT claims set (stash_item, move_item, update_item,
//      create_location), so activity events and their path strings come out
//      exactly as in the app, and the caps are exercised:
//        - typical:   30 items, 15 places at depth 1–3, ~150 events
//        - maxed out: 100 items (80-char names, 500-char details), 100 places
//                     (60-char names, 12 chains 8 deep), 600+ moves → 200 events
//                     kept; then the 101st item / place and a 9th level must
//                     fail with SL001 / SL002 / SL003
//        - many:      50 typical + 10 maxed-out households, measured together
//   4. measures again after a churn pass (moves, deletes, re-stashes) before
//      and after VACUUM, to see the bloat autovacuum leaves behind;
//   5. prints a markdown report, then deletes every user and household it made.
//
// Needs SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (the same
// gitignored .env.rls.local as test:rls) and Docker (it runs psql inside the
// local database container). TypeScript, run directly by Node's type
// stripping (no build step): only erasable syntax here.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types";

type Client = SupabaseClient<Database>;

interface TableSize {
  table: string;
  total: number;
  heap: number;
  index: number;
  toast: number;
  rows: number;
}

interface Snapshot {
  databaseBytes: number;
  tables: Map<string, TableSize>;
}

interface Person {
  userId: string;
  client: Client;
}

interface Couple {
  householdId: string;
  owner: Person;
  partner: Person;
}

type LiveRowBytes = Record<"items" | "locations" | "activity_events", number | null>;

const TYPICAL_HOUSEHOLDS = 50;
const MAXED_HOUSEHOLDS = 10;
const TARGET_HOUSEHOLDS = 500;
const FREE_TIER_BYTES = 500 * 1024 * 1024;
const PASSWORD = "measure-db-password-1!";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(
      `measure-db: missing ${name}. Run \`supabase start\` and write API_URL/ANON_KEY/SERVICE_ROLE_KEY to .env.rls.local.`,
    );
    process.exit(1);
  }
  return value;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
const service: Client = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const root = process.cwd();
const config = await readFile(path.join(root, "supabase", "config.toml"), "utf8");
const projectId = /^project_id\s*=\s*"([^"]+)"/m.exec(config)?.[1];
if (!projectId) {
  console.error("measure-db: no project_id in supabase/config.toml");
  process.exit(1);
}
const container = `supabase_db_${projectId}`;
const sizesSql = await readFile(path.join(root, "scripts", "measure-db", "sizes.sql"), "utf8");

/** Runs SQL as the postgres superuser inside the local database container. */
function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", "-q"],
    { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
}

/** A SQL string literal. */
function lit(text: string): string {
  return `'${text.replaceAll("'", "''")}'`;
}

function textArray(values: readonly string[]): string {
  return `array[${values.map(lit).join(", ")}]::text[]`;
}

/** Runs `body` as `authenticated`, as `userId` — the same role and claims PostgREST gives the app. */
function asUser(userId: string, body: string): void {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  psql(`begin;
set local role authenticated;
select set_config('request.jwt.claims', ${lit(claims)}, true);
${body}
commit;`);
}

/** The last line psql printed: every query here ends in one JSON value. */
function lastLine(output: string): string {
  return output.trim().split("\n").at(-1) ?? "";
}

/**
 * Sizes and row counts. "analyze" runs VACUUM ANALYZE first, so dead tuples
 * are marked free; "full" rewrites every table compactly first (VACUUM FULL,
 * local only) so a run never measures into space an earlier run freed;
 * "none" measures as autovacuum would leave things.
 */
function measure(vacuum: "full" | "analyze" | "none" = "analyze"): Snapshot {
  if (vacuum === "full") {
    psql("vacuum full analyze;");
  } else if (vacuum === "analyze") {
    psql("vacuum analyze;");
  }
  const snapshot = JSON.parse(lastLine(psql(sizesSql))) as { database_bytes: number; tables: TableSize[] };
  return {
    databaseBytes: snapshot.database_bytes,
    tables: new Map(snapshot.tables.map((size) => [size.table, size])),
  };
}

/**
 * Average live row size (pg_column_size of the whole row) in the given
 * households: what a row holds, without the dead space updates leave in the
 * file. The file sizes above are what the 500 MB limit actually counts.
 */
function liveRowBytes(householdIds: readonly string[]): LiveRowBytes {
  const ids = `array[${householdIds.map(lit).join(", ")}]::uuid[]`;
  const out = psql(`select json_build_object(
  'items', (select avg(pg_column_size(t.*)) from public.items t where household_id = any(${ids})),
  'locations', (select avg(pg_column_size(t.*)) from public.locations t where household_id = any(${ids})),
  'activity_events', (select avg(pg_column_size(t.*)) from public.activity_events t where household_id = any(${ids}))
);`);
  return JSON.parse(lastLine(out)) as LiveRowBytes;
}

// ---------------------------------------------------------------------------
// Accounts and households, the way the app makes them
// ---------------------------------------------------------------------------

const runTag = randomUUID().slice(0, 8);
const createdUserIds: string[] = [];
const createdHouseholdIds: string[] = [];

async function newPerson(label: string, displayName: string): Promise<Person> {
  const email = `measure-db-${runTag}-${label}@example.com`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) {
    throw new Error(`createUser ${label}: ${error.message}`);
  }
  createdUserIds.push(data.user.id);
  // Sign in once, so sessions / refresh_tokens / audit_log_entries are counted.
  const anon = createClient<Database>(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) {
    throw new Error(`signIn ${label}: ${signInError.message}`);
  }
  const client = createClient<Database>(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });
  return { userId: data.user.id, client };
}

/** A couple sharing one household: create_household, create_invite, redeem_invite. */
async function newCouple(label: string): Promise<Couple> {
  const [owner, partner] = await Promise.all([
    newPerson(`${label}-a`, `Noa ${label}`),
    newPerson(`${label}-b`, `Maya ${label}`),
  ]);
  const { data: household, error } = await owner.client.rpc("create_household", { p_name: `Noa's household` });
  if (error) {
    throw new Error(`create_household ${label}: ${error.message}`);
  }
  createdHouseholdIds.push(household.id);
  const { data: invite, error: inviteError } = await owner.client.rpc("create_invite");
  if (inviteError) {
    throw new Error(`create_invite ${label}: ${inviteError.message}`);
  }
  const { error: redeemError } = await partner.client.rpc("redeem_invite", { p_code: invite.code });
  if (redeemError) {
    throw new Error(`redeem_invite ${label}: ${redeemError.message}`);
  }
  return { householdId: household.id, owner, partner };
}

async function inBatches<T>(count: number, size: number, make: (index: number) => Promise<T>): Promise<T[]> {
  const results: T[] = [];
  for (let start = 0; start < count; start += size) {
    const batch = Array.from({ length: Math.min(size, count - start) }, (_, offset) => make(start + offset));
    results.push(...(await Promise.all(batch)));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Seeding through the write functions
// ---------------------------------------------------------------------------

// Fifteen places at depth 1–3 (these seven paths share their rooms), the
// shape of a real home's hiding spots.
const TYPICAL_PATHS = [
  ["Bedroom", "Wardrobe"],
  ["Bedroom", "Desk", "Top drawer"],
  ["Office", "Filing cabinet", "Bottom drawer"],
  ["Garage", "Shelf", "Red box"],
  ["Garage", "Camping crate"],
  ["Kitchen", "Pantry"],
  ["Hallway", "Key bowl"],
];

// Thirty things a couple actually loses, with the kind of detail they type.
const TYPICAL_ITEMS: readonly (readonly [string, string | null])[] = [
  ["Passport", "In the blue folder, behind the tax returns"],
  ["Birth certificates", "Same folder as the passports"],
  ["Spare house keys", "On the red keyring"],
  ["Car title", null],
  ["Vaccination records", "Kids' booklets too"],
  ["Tent", "Four-person, poles in the long bag"],
  ["Sleeping bags", "Two, compressed"],
  ["Camping stove", "Gas canister is separate"],
  ["Bike pump", null],
  ["Winter tyre bolts", "Locking bolt key is taped to the lid"],
  ["Warranty papers", "Fridge, washer, TV"],
  ["Spare phone charger", "USB-C"],
  ["Christmas lights", "Tested, two strings don't work"],
  ["Extension cord", "The long orange one"],
  ["Sewing kit", null],
  ["Spare glasses", "Old prescription, still usable"],
  ["Power of attorney", "Original, signed copy at the lawyer's"],
  ["Insurance policies", "Home and car"],
  ["Toolbox", "Missing the 10mm socket"],
  ["Ski goggles", null],
  ["Picnic blanket", "Waterproof side down"],
  ["Hard drive backup", "Photos up to 2025"],
  ["Spare remote", "TV, not the soundbar"],
  ["Gift wrap", "And the good scissors"],
  ["First aid kit", "Check expiry on the plasters"],
  ["Allen keys", "From the IKEA wardrobe"],
  ["Rain ponchos", "Four"],
  ["Paint samples", "Living room colour is the second one"],
  ["Mailbox key", "Small brass one"],
  ["Headlamp", "Batteries in the drawer below"],
];

function seedTypical({ householdId, owner, partner }: Couple): void {
  const stashes = TYPICAL_ITEMS.map(([name, detail], index) => {
    const pathNames = TYPICAL_PATHS[index % TYPICAL_PATHS.length] ?? [];
    return `select public.stash_item(${lit(name)}, ${detail === null ? "null" : lit(detail)}, null, ${textArray(pathNames)});`;
  });
  asUser(owner.userId, stashes.join("\n"));

  // About four changes per item, by the partner: moves and detail edits.
  asUser(
    partner.userId,
    `do $$
declare
  v_items uuid[];
  v_item public.items;
  i integer;
begin
  select array_agg(id order by added_at) into v_items from public.items where household_id = ${lit(householdId)};
  for i in 1..120 loop
    select * into v_item from public.items where id = v_items[1 + (i % array_length(v_items, 1))];
    if i % 2 = 0 then
      -- Always somewhere else: a move to the same place is a no-op.
      perform public.move_item(
        v_item.id,
        (select id from public.locations
         where household_id = ${lit(householdId)} and id <> v_item.location_id
         order by md5(id::text || i::text) limit 1)
      );
    else
      perform public.update_item(v_item.id, v_item.name, 'Checked ' || i || ': ' || coalesce(v_item.detail, 'still there'));
    end if;
  end loop;
end $$;`,
  );
}

/** Exactly `length` characters, starting with `prefix`. */
function sized(prefix: string, length: number): string {
  return prefix.padEnd(length, " filler").slice(0, length);
}

const CHAINS = 12;
const CHAIN_DEPTH = 8;

function seedMaxed({ householdId, owner, partner }: Couple): void {
  // 12 chains 8 deep = 96 places, every name 60 characters, created by the
  // first stash into each chain; then 4 more top-level places = 100.
  const chainNames = Array.from({ length: CHAINS }, (_, chain) =>
    Array.from({ length: CHAIN_DEPTH }, (_, level) =>
      sized(`Chain ${String(chain + 1)} level ${String(level + 1)} `, 60),
    ),
  );
  const detail = sized("Exactly where it is, in as many words as a detail can hold: ", 500);
  const statements = [];
  for (let item = 0; item < 100; item += 1) {
    const chain = item % CHAINS;
    statements.push(
      `select public.stash_item(${lit(sized(`Thing ${String(item + 1)} with the longest name an item can have `, 80))}, ${lit(detail)}, null, ${textArray(chainNames[chain] ?? [])});`,
    );
  }
  for (let extra = 1; extra <= 4; extra += 1) {
    statements.push(`select public.create_location(${lit(sized(`Extra place ${String(extra)} `, 60))});`);
  }
  asUser(owner.userId, statements.join("\n"));

  // The caps hold: a 101st item, a 101st place, a 9th level.
  asUser(
    owner.userId,
    `do $$
declare
  v_deepest uuid;
begin
  select id into v_deepest from public.locations
  where household_id = ${lit(householdId)} and name like 'Chain 1 level 8%';

  begin
    perform public.stash_item('One too many', null, v_deepest);
    raise exception 'measure-db: the 101st item was accepted';
  exception when sqlstate 'SL001' then null;
  end;

  begin
    perform public.create_location('One place too many');
    raise exception 'measure-db: the 101st place was accepted';
  exception when sqlstate 'SL002' then null;
  end;

  begin
    perform public.create_location('Ninth level', v_deepest);
    raise exception 'measure-db: a 9th level was accepted';
  exception when sqlstate 'SL003' then null;
  end;
end $$;`,
  );

  // 600 moves between the deepest places: the longest from → to strings an
  // event can hold, and far past the 200 that are kept.
  moveInBatches(partner.userId, householdId, 600);
}

/**
 * `count` moves, 100 per transaction with a VACUUM in between: in the app
 * every change is its own transaction and autovacuum reclaims what pruning
 * deletes (a table this small is vacuumed after ~50 dead rows), so the file
 * holds about the retention window. One huge transaction would instead grow
 * it to hold every event ever written, and measure the script, not the app.
 */
function moveInBatches(userId: string, householdId: string, count: number): void {
  for (let done = 0; done < count; done += MOVE_BATCH) {
    asUser(userId, movesSql(householdId, Math.min(MOVE_BATCH, count - done), done));
    psql("vacuum public.activity_events, public.items;");
  }
}

const MOVE_BATCH = 100;

function movesSql(householdId: string, count: number, offset = 0): string {
  return `do $$
declare
  v_items uuid[];
  v_deepest uuid[];
  i integer;
begin
  select array_agg(id order by added_at) into v_items from public.items where household_id = ${lit(householdId)};
  select array_agg(id order by name) into v_deepest from public.locations
  where household_id = ${lit(householdId)} and name like 'Chain % level 8%';
  for i in ${String(offset + 1)}..${String(offset + count)} loop
    perform public.move_item(
      v_items[1 + (i % array_length(v_items, 1))],
      v_deepest[1 + ((i * 5) % array_length(v_deepest, 1))]
    );
  end loop;
end $$;`;
}

/** Churn: more moves, ten deletes and ten re-stashes per maxed-out household. */
function churn({ householdId, owner }: Couple): void {
  moveInBatches(owner.userId, householdId, 200);
  asUser(
    owner.userId,
    `do $$
declare
  v_item public.items;
begin
  for v_item in
    select * from public.items where household_id = ${lit(householdId)} order by added_at limit 10
  loop
    perform public.delete_item(v_item.id);
    perform public.stash_item(v_item.name, v_item.detail, v_item.location_id);
  end loop;
end $$;`,
  );
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const PUBLIC_ROWS = ["public.items", "public.locations", "public.activity_events"];

function delta(before: Snapshot, after: Snapshot): TableSize[] {
  const rows: TableSize[] = [];
  for (const [table, end] of after.tables) {
    const start = before.tables.get(table) ?? { total: 0, heap: 0, index: 0, toast: 0, rows: 0 };
    rows.push({
      table,
      total: end.total - start.total,
      heap: end.heap - start.heap,
      index: end.index - start.index,
      toast: end.toast - start.toast,
      rows: end.rows - start.rows,
    });
  }
  return rows;
}

function sum(rows: readonly TableSize[], prefix = ""): number {
  return rows.filter((row) => row.table.startsWith(prefix)).reduce((total, row) => total + row.total, 0);
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`;
const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const perRow = (row: TableSize): string => (row.rows > 0 ? `${String(Math.round(row.total / row.rows))} B` : "—");

function tableReport(title: string, rows: readonly TableSize[]): string {
  const lines = [
    `### ${title}`,
    "",
    "| Table | Δ rows | Δ total | heap | index | TOAST | per row |",
    "|---|---:|---:|---:|---:|---:|---:|",
  ];
  for (const row of rows.filter((r) => r.rows !== 0 || r.total !== 0)) {
    lines.push(
      `| ${row.table} | ${String(row.rows)} | ${kb(row.total)} | ${kb(row.heap)} | ${kb(row.index)} | ${kb(row.toast)} | ${perRow(row)} |`,
    );
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function cleanUp(): Promise<void> {
  if (createdHouseholdIds.length > 0) {
    await service.from("items").delete().in("household_id", createdHouseholdIds);
    await service.from("households").delete().in("id", createdHouseholdIds);
  }
  for (const userId of createdUserIds) {
    await service.auth.admin.deleteUser(userId);
  }
}

const started = Date.now();
try {
  console.error(`measure-db: run ${runTag} against ${container}`);
  const baseline = measure("full");

  console.error(`measure-db: ${String(TYPICAL_HOUSEHOLDS)} typical households…`);
  const typical = await inBatches(TYPICAL_HOUSEHOLDS, 10, (index) => newCouple(`t${String(index)}`));
  typical.forEach(seedTypical);
  // Each phase is measured as written (after a plain VACUUM, as autovacuum
  // leaves it), then compacted (VACUUM FULL), so the next phase starts with
  // no free space to fill and its growth is its own.
  const afterTypical = measure();
  const typicalCompact = measure("full");

  console.error(`measure-db: ${String(MAXED_HOUSEHOLDS)} maxed-out households…`);
  const maxed = await inBatches(MAXED_HOUSEHOLDS, 5, (index) => newCouple(`m${String(index)}`));
  maxed.forEach(seedMaxed);
  const afterMaxed = measure();
  const maxedCompact = measure("full");
  const liveTypical = liveRowBytes(typical.map((household) => household.householdId));
  const liveMaxed = liveRowBytes(maxed.map((household) => household.householdId));

  console.error("measure-db: churn…");
  maxed.forEach(churn);
  const afterChurnNoVacuum = measure("none");
  const afterChurn = measure();

  const typicalDelta = delta(baseline, afterTypical);
  const typicalCompactDelta = delta(baseline, typicalCompact);
  const maxedDelta = delta(typicalCompact, afterMaxed);
  const maxedCompactDelta = delta(typicalCompact, maxedCompact);
  const churnBloat = delta(maxedCompact, afterChurnNoVacuum);
  const churnVacuumed = delta(maxedCompact, afterChurn);

  const usersPerHousehold = 2;
  const authPerUser = sum(typicalDelta, "auth.") / (TYPICAL_HOUSEHOLDS * usersPerHousehold);
  const typicalPerHousehold = sum(typicalDelta) / TYPICAL_HOUSEHOLDS;
  const maxedPerHousehold = sum(maxedDelta) / MAXED_HOUSEHOLDS;
  const typicalCompactPerHousehold = sum(typicalCompactDelta) / TYPICAL_HOUSEHOLDS;
  const maxedCompactPerHousehold = sum(maxedCompactDelta) / MAXED_HOUSEHOLDS;
  const events = (rows: readonly TableSize[]): number =>
    rows.find((row) => row.table === "public.activity_events")?.rows ?? 0;

  const allTypical = typicalPerHousehold * TARGET_HOUSEHOLDS;
  const allMaxed = maxedPerHousehold * TARGET_HOUSEHOLDS;
  const budgetAfterBaseline = FREE_TIER_BYTES - baseline.databaseBytes;

  const report = [
    `## measure:db — ${new Date().toISOString().slice(0, 10)} (run ${runTag}, ${String(Math.round((Date.now() - started) / 1000))} s)`,
    "",
    `Local database before the run: ${mb(baseline.databaseBytes)} (Supabase's own schemas plus leftover dev/test data; production's baseline is measured separately).`,
    "",
    "| Per household, incl. auth for 2 people | As written | Compacted |",
    "|---|---:|---:|",
    `| Typical (30 items, 15 places, ${String(Math.round(events(typicalDelta) / TYPICAL_HOUSEHOLDS))} events) | ${kb(typicalPerHousehold)} | ${kb(typicalCompactPerHousehold)} |`,
    `| Maxed out (100 items, 100 places, depth 8, ${String(Math.round(events(maxedDelta) / MAXED_HOUSEHOLDS))} events kept) | ${kb(maxedPerHousehold)} | ${kb(maxedCompactPerHousehold)} |`,
    `| Auth rows per person (users, identities, sessions, refresh tokens, audit log) | ${kb(authPerUser)} | |`,
    "",
    "As written = after the writes and a plain VACUUM, the way autovacuum leaves a table (changes are written one transaction at a time; dead rows' space is reused, not returned). Compacted = after VACUUM FULL: the data itself. The projection below uses as written.",
    "",
    "| Bytes per row | Typical, live | Typical, on disk | Maxed out, live | Maxed out, on disk |",
    "|---|---:|---:|---:|---:|",
    ...PUBLIC_ROWS.map((table) => {
      const key = table.replace("public.", "") as keyof LiveRowBytes;
      const t = typicalDelta.find((row) => row.table === table);
      const m = maxedDelta.find((row) => row.table === table);
      const live = (value: number | null): string => (value === null ? "—" : `${String(Math.round(value))} B`);
      return `| ${key} | ${live(liveTypical[key])} | ${t ? perRow(t) : "—"} | ${live(liveMaxed[key])} | ${m ? perRow(m) : "—"} |`;
    }),
    "",
    "Live = the row itself (pg_column_size); on disk = file growth ÷ rows as written, which includes the space updates and moves leave behind. The 500 MB limit counts files.",
    "",
    `Churn (200 more moves, 10 deletes + re-stashes per maxed household): +${kb(sum(churnBloat) / MAXED_HOUSEHOLDS)} per household before VACUUM, +${kb(sum(churnVacuumed) / MAXED_HOUSEHOLDS)} after.`,
    "",
    `### ${String(TARGET_HOUSEHOLDS)} households`,
    "",
    `- all typical: ${mb(allTypical)}`,
    `- all maxed out: ${mb(allMaxed)}`,
    `- free-tier budget after this database's baseline: ${mb(budgetAfterBaseline)} (500 MB − ${mb(baseline.databaseBytes)})`,
    `- maxed-out households that fit the budget: ${String(Math.floor(budgetAfterBaseline / maxedPerHousehold))}`,
    `- verdict: ${allMaxed <= budgetAfterBaseline ? "holds even if every household is maxed out" : allTypical <= budgetAfterBaseline ? "holds for typical households; an all-maxed-out worst case would not" : "does not hold"}`,
    "",
    tableReport("Typical households (Δ over the baseline)", typicalDelta),
    "",
    tableReport("Maxed-out households (Δ over the compacted typical step)", maxedDelta),
    "",
    tableReport("Churn, before VACUUM", churnBloat),
  ].join("\n");

  console.log(report);
} finally {
  console.error("measure-db: cleaning up…");
  await cleanUp();
}
