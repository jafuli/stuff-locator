-- Table, heap, index and TOAST sizes plus row counts for every table the
-- capacity measurement cares about, as one JSON array (scripts/measure-db.mjs).
-- Run after VACUUM ANALYZE so the sizes are of live data, not dead tuples.
with tracked(schema_name, table_name) as (
  select table_schema, table_name
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE'
  union all
  select 'auth', unnest(array['users', 'identities', 'sessions', 'refresh_tokens', 'audit_log_entries'])
),
sized as (
  select t.schema_name,
         t.table_name,
         c.oid,
         pg_total_relation_size(c.oid) as total_bytes,
         pg_relation_size(c.oid) as heap_bytes,
         pg_indexes_size(c.oid) as index_bytes,
         coalesce(pg_total_relation_size(nullif(c.reltoastrelid, 0)), 0) as toast_bytes
  from tracked t
  join pg_namespace n on n.nspname = t.schema_name
  join pg_class c on c.relnamespace = n.oid and c.relname = t.table_name
)
select json_build_object(
  'database_bytes', pg_database_size(current_database()),
  'tables', json_agg(
    json_build_object(
      'table', schema_name || '.' || table_name,
      'total', total_bytes,
      'heap', heap_bytes,
      'index', index_bytes,
      'toast', toast_bytes,
      'rows', (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', schema_name, table_name), false, true, '')))[1]::text::bigint
    )
    order by schema_name, table_name
  )
)
from sized;
