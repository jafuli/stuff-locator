-- Display names: the name a person gives at sign-up, not their email handle.
--
-- profiles.display_name was seeded from the email's local part, so Stuff and
-- Activity read "itamar.badash+onboarding-claude added Passport". Sign-up
-- now asks for "Your name" and sends it as user metadata
-- (auth.signUp options.data.display_name); this trigger uses it.
--
-- Rules:
--   - the metadata name is used when it is a JSON string with something in
--     it once whitespace is normalised (trimmed, runs collapsed to one space);
--   - it is clamped to the 50-character limit (ADR 0015);
--   - otherwise, the email handle as before (also clamped);
--   - nothing here may fail a sign-up: this runs inside the auth.users
--     insert, so an exception would roll the account back. Any error falls
--     back to the email handle, and a failure of that too still lets the
--     account through (losing a profile row is recoverable; the read side
--     already shows "Someone").
--
-- Existing users keep their seeded name until they change it in the
-- household sheet (through the existing "you can rename yourself" policy).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  begin
    if jsonb_typeof(new.raw_user_meta_data -> 'display_name') = 'string' then
      v_name := btrim(left(btrim(regexp_replace(new.raw_user_meta_data ->> 'display_name', '\s+', ' ', 'g')), 50));
    end if;
  exception when others then
    v_name := null;
  end;

  if v_name is null or v_name = '' then
    v_name := public.profile_display_name_for(new.email);
  end if;

  begin
    insert into public.profiles (user_id, display_name)
    values (new.id, v_name)
    on conflict (user_id) do nothing;
  exception when others then
    -- Never fail the sign-up over a profile row.
    raise warning 'handle_new_user: could not create a profile for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- A person renames only their own display name. The table grant was
-- `update` on every column; the row policy already pins user_id, but there
-- is no reason for a client to be able to write created_at either.
revoke update on public.profiles from authenticated;
grant update (display_name) on public.profiles to authenticated;
