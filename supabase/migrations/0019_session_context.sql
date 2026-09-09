-- Session context for authenticated users.
--
-- get_my_context() returns the caller's complete profile plus the committees
-- they lead in ONE round-trip, so getSessionUser no longer issues two separate
-- PostgREST requests (profiles select + led_committee_ids) per navigation.

create or replace function public.get_my_context()
returns json
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_profile jsonb;
  v_led uuid[];
begin
  if v_uid is null then
    return null;
  end if;

  select to_jsonb(p)
    into v_profile
  from public.profiles p
  where p.id = v_uid;

  if v_profile is null then
    return null;
  end if;

  select coalesce(array_agg(lc.committee_id), array[]::uuid[])
    into v_led
  from public.committee_leaders lc
  where lc.leader_id = v_uid;

  return json_build_object(
    'profile', v_profile,
    'led_committee_ids', to_jsonb(v_led)
  );
end;
$$;

revoke all on function public.get_my_context() from public;
grant execute on function public.get_my_context() to authenticated;