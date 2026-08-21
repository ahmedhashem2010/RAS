-- ============================================================
-- RAS — P1 team management: leaders manage their own team,
-- volunteers can leave a team, co-leader rules preserved.
--
-- Business decisions implemented here (server actions are the
-- UI layer; the DB enforces the same permissions):
--
-- 1) Team leader / co-leader:
--      INSERT team_members  -> own team only
--      DELETE team_members  -> own team only
--      INSERT team_leaders  -> own team only (add co-leader)
--      DELETE team_leaders  -> own team only (remove co-leader)
--    They keep NO write access to teams (name/description/color/
--    eval_mode) and NO general-admin powers.
-- 2) Volunteer:
--      DELETE own team_members row only (member_leave_self).
--      No self-INSERT into arbitrary teams; no mutation of others.
-- 3) Admins (general/super) retain global access (existing
--    members_write_admin / members_delete_admin /
--    leaders_write_admin / leaders_delete_admin unchanged).
-- 4) Banned users are blocked at the DB layer for team
--    management: is_team_leader() now requires status='active'
--    (defense-in-depth on top of the session-layer redirect).
-- 5) check_leader_single_team() trigger is PRESERVED untouched:
--    "A volunteer cannot lead more than one team" still holds.
-- 6) Audit: log_audit() whitelist gains 'member_left_team';
--    team leaders may log member_added / member_removed /
--    leader_assigned / leader_removed ONLY for a team they lead
--    (target_id = team uuid). Everything else keeps its previous
--    authorization exactly.
--
-- Non-destructive: no DROP TABLE / TRUNCATE / DELETE of data;
-- only policies, functions and grants change.
-- ============================================================

-- ---------- HARDEN is_team_leader(): require an ACTIVE caller ----------

create or replace function public.is_team_leader(team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select public.is_active_user()
    and exists (
      select 1 from public.team_leaders
      where leader_id = auth.uid() and team_id = is_team_leader.team_id
    );
$$;

revoke execute on function public.is_team_leader(uuid) from public, anon;
grant execute on function public.is_team_leader(uuid) to authenticated;

-- ---------- TEAM MEMBERS: leader write policies ----------
-- (existing members_write_admin / members_delete_admin stay intact)

drop policy if exists "members_write_leader" on public.team_members;
create policy "members_write_leader" on public.team_members
  for insert to authenticated with check (
    public.is_team_leader(team_id)
  );

drop policy if exists "members_delete_leader" on public.team_members;
create policy "members_delete_leader" on public.team_members
  for delete to authenticated using (
    public.is_team_leader(team_id)
  );

-- Volunteer leaves a team: DELETE own membership row only.
-- is_active_user() blocks banned users at the DB layer too.

drop policy if exists "members_delete_self" on public.team_members;
create policy "members_delete_self" on public.team_members
  for delete to authenticated using (
    volunteer_id = auth.uid() and public.is_active_user()
  );

-- ---------- TEAM LEADERS: co-leader management by the leader ----------
-- (existing leaders_write_admin / leaders_delete_admin stay intact)

drop policy if exists "leaders_write_leader" on public.team_leaders;
create policy "leaders_write_leader" on public.team_leaders
  for insert to authenticated with check (
    public.is_team_leader(team_id)
  );

drop policy if exists "leaders_delete_leader" on public.team_leaders;
create policy "leaders_delete_leader" on public.team_leaders
  for delete to authenticated using (
    public.is_team_leader(team_id)
  );

-- check_leader_single_team() trigger on team_leaders is unchanged:
-- adding a leader who already leads another team still raises
-- 'A volunteer cannot lead more than one team'.

-- ---------- AUDIT: allow leader team actions + member_left_team ----------

create or replace function public.log_audit(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_team_uuid uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_action not in (
    'user_created', 'user_banned', 'user_unbanned', 'user_role_changed',
    'award_created', 'award_deleted', 'warning_issued', 'warning_deleted',
    'settings_updated', 'profile_updated',
    'team_created', 'team_updated', 'team_deleted',
    'member_added', 'member_removed', 'leader_assigned', 'leader_removed',
    'member_left_team',
    'convoy_created', 'convoy_updated', 'convoy_status_changed', 'convoy_deleted',
    'attendance_changed', 'rating_created', 'rating_updated',
    'task_created', 'task_updated', 'task_deleted', 'task_reviewed', 'task_reopened'
  ) then
    raise exception 'Unknown audit action';
  end if;

  -- Safe-cast target_id to uuid when it is the team id.
  begin
    v_team_uuid := nullif(p_target_id, '')::uuid;
  exception when others then
    v_team_uuid := null;
  end;

  if public.is_admin()
    or (p_action = 'member_left_team' and public.is_active_user())
    or (
      exists (select 1 from public.team_leaders where leader_id = v_uid)
      and p_action in (
        'attendance_changed', 'rating_created', 'rating_updated',
        'task_created', 'task_updated', 'task_deleted', 'task_reviewed', 'task_reopened'
      )
    )
    or (
      p_action in ('member_added', 'member_removed', 'leader_assigned', 'leader_removed')
      and v_team_uuid is not null
      and exists (
        select 1 from public.team_leaders
        where leader_id = v_uid and team_id = v_team_uuid
      )
    )
  then
    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (v_uid, p_action, p_target_type, p_target_id, p_metadata);
  else
    raise exception 'Not authorized to write audit logs';
  end if;
end $$;
