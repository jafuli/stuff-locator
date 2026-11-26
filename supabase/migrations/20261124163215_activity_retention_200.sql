-- Activity retention: keep the newest 200 events per household, not 500
-- (ADR 0015 / 0011 amendments, Itamar 2026-11-24).
--
-- Events were ~69% of a maxed-out household on disk (`npm run measure:db`),
-- and the feed showed only the newest 100 of the 500 kept, with no way to
-- reach the rest. The feed now pages back through everything that is kept
-- ("Show earlier activity"), so retention is what someone can actually see,
-- and a maxed-out household shrinks enough that 500 of them fit the free
-- tier's budget.
--
-- Same helper, same transaction, same caveat as before (see
-- 20261124115842_household_limits.sql): no household lock, so two writes
-- committing at the same instant can briefly leave 201.

create or replace function public.record_activity_event(
  p_household_id uuid,
  p_kind text,
  p_subject_id uuid,
  p_subject_name text,
  p_from_text text default null,
  p_to_text text default null,
  p_detail_text text default null
)
returns void
language plpgsql
set search_path = public
as $$
begin
  insert into public.activity_events (
    household_id, actor_id, kind, subject_id, subject_name, from_text, to_text, detail_text, created_at
  )
  values (
    p_household_id, auth.uid(), p_kind, p_subject_id, p_subject_name, p_from_text, p_to_text, p_detail_text,
    clock_timestamp()
  );

  delete from public.activity_events
  where id in (
    select id
    from public.activity_events
    where household_id = p_household_id
    order by created_at desc, id desc
    offset 200
  );
end;
$$;

-- Prune what is already there, once.
delete from public.activity_events
where id in (
  select id
  from (
    select id,
           row_number() over (partition by household_id order by created_at desc, id desc) as n
    from public.activity_events
  ) ranked
  where n > 200
);
