-- Place names can't contain "›" (ADR 0010 amendment, 2026-11-24).
--
-- "›" is the path separator: location_path_text joins a path's names with
-- ' › ', activity_events stores those strings, and the Activity feed splits
-- them back into segments on "›" (pathSegmentsFromText). A place named
-- "A › B" would come back as two places, "A" and "B". Nothing stopped such a
-- name until now; this closes it at the database, so every writer
-- (stash_item, move_item / update_item with a new path, create_location,
-- rename_location) refuses it with the CHECK's 23514. The app maps that
-- constraint to its own copy and validates before it gets here.
--
-- Existing data: the migration stops with a list if any place already has
-- the character in its name. It never rewrites a name.

do $$
declare
  v_total integer;
  v_sample text;
begin
  select count(*)::integer,
         string_agg(format('%s (%s)', id, name), E'\n' order by id) filter (where n <= 25)
  into v_total, v_sample
  from (
    select id, name, row_number() over (order by id) as n
    from public.locations
    where strpos(name, '›') > 0
  ) as offending;

  if v_total > 0 then
    raise exception E'no_path_separator: % place name(s) contain "›". Rename them by hand (nothing is rewritten automatically), then re-run this migration. First rows:\n%',
      v_total, v_sample;
  end if;
end;
$$;

alter table public.locations
  add constraint locations_name_no_path_separator check (strpos(name, '›') = 0);
