-- location_subtree_items RPC — recursive read of items under a location
-- and its nested descendants
--
-- Closes a gap named directly in the settled Design Journal: locations
-- self-reference to arbitrary depth, and "everything in the garage" needs
-- to walk the subtree via a recursive CTE. Cycle prevention (the other
-- piece of backend work the self-referencing model requires) is a
-- separate, future move_container task.
--
-- This is a read, not a write with invariants: unlike move_item/
-- delete_container's explicit RAISE EXCEPTION pattern for invalid input,
-- a nonexistent or RLS-invisible p_location_id here just yields zero rows,
-- same as any other query a caller isn't authorized to see anything for.
--
-- NOT SECURITY DEFINER, and no explicit `authenticated`-only visibility
-- check is needed beyond RLS itself: the recursive CTE's base case
-- (`select id from locations where id = p_location_id`) already runs
-- under the caller's own RLS-gated `locations` policy. If the caller
-- isn't a member of that location's household, the base case returns zero
-- rows, the recursion never has anything to expand from, and the whole
-- function returns zero items — by construction, not by an extra check
-- bolted on afterward. The same applies to every recursive step: a
-- descendant location belonging to a different household (if that were
-- ever possible) is never traversed into, because the join's own
-- `locations l` scan is just as RLS-gated as the base case.
create function public.location_subtree_items(p_location_id uuid)
returns setof public.items
language sql
stable
set search_path = public
as $$
  with recursive subtree(id) as (
    select id
    from public.locations
    where id = p_location_id
    union all
    select l.id
    from public.locations l
    join subtree s on l.parent_id = s.id
  )
  select i.*
  from public.items i
  where i.location_id in (select id from subtree);
$$;

revoke all on function public.location_subtree_items(uuid) from public, anon;
grant execute on function public.location_subtree_items(uuid) to authenticated;
