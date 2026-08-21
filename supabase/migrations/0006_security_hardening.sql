-- ============================================================
-- RAS — P2 security, privacy & data-integrity hardening
-- 1) Leaderboard/score privacy: revoke direct view grants and
--    expose role-scoped SECURITY DEFINER RPCs instead.
-- 2) Cancelled convoys become immutable (attendance/evaluations).
-- 3) app_settings writes restricted to Super Admin at the DB level;
--    reads opened to all authenticated (public app config).
-- 4) log_audit hardened against fabrication (action allowlist +
--    role check); direct admin inserts into audit_logs removed.
-- 5) Missing attendance DELETE policy added (required by
--    saveAttendance) with the same locking rules.
-- ============================================================

-- ---------- Revoke direct access to sensitive views ----------
-- Both anon and authenticated: clients only reach these through the
-- role-scoped RPCs below, never through PostgREST table/view access.
revoke all on public.public_profiles from anon, authenticated;
revoke all on public.volunteer_scores from anon, authenticated;
revoke all on public.team_leaderboard from anon, authenticated;

-- ============================================================
-- LEADERBOARD / SCORE RPCs
-- Detail columns (attendance/task/convoy percents, seniority,
-- opportunities/points, approved tasks, evaluations) are masked
-- for plain members unless leaderboard_visible_to_all is enabled.
-- ============================================================

create or replace function public.get_team_leaderboard(p_team_id uuid)
returns table(
  team_id uuid,
  volunteer_id uuid,
  full_name text,
  avatar_url text,
  status public.account_status,
  overall_score numeric,
  attendance_percent numeric,
  task_percent numeric,
  convoy_percent numeric,
  seniority_score numeric,
  attendance_opportunities bigint,
  attendance_points numeric,
  approved_tasks bigint,
  evaluations bigint,
  joined_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with allow_detail as (
    select coalesce(
      (select (value #>> '{}')::boolean from public.app_settings where key = 'leaderboard_visible_to_all'),
      false
    ) as v
  )
  select
    tm.team_id,
    tm.volunteer_id,
    p.full_name,
    p.avatar_url,
    p.status,
    s.overall_score,
    case when public.is_admin() or public.is_team_leader(p_team_id) or allow_detail.v then s.attendance_percent end,
    case when public.is_admin() or public.is_team_leader(p_team_id) or allow_detail.v then s.task_percent end,
    case when public.is_admin() or public.is_team_leader(p_team_id) or allow_detail.v then s.convoy_percent end,
    case when public.is_admin() or public.is_team_leader(p_team_id) or allow_detail.v then s.seniority_score end,
    case when public.is_admin() or public.is_team_leader(p_team_id) or allow_detail.v then s.attendance_opportunities end,
    case when public.is_admin() or public.is_team_leader(p_team_id) or allow_detail.v then s.attendance_points end,
    case when public.is_admin() or public.is_team_leader(p_team_id) or allow_detail.v then s.approved_tasks end,
    case when public.is_admin() or public.is_team_leader(p_team_id) or allow_detail.v then s.evaluations end,
    tm.joined_at
  from public.team_members tm
  join public.profiles p on p.id = tm.volunteer_id
  left join public.volunteer_scores s on s.volunteer_id = tm.volunteer_id
  cross join allow_detail
  where tm.team_id = p_team_id
    and (public.is_admin() or public.is_team_leader(p_team_id) or public.is_team_member(p_team_id));
$$;

create or replace function public.get_leaderboard()
returns table(
  team_id uuid,
  volunteer_id uuid,
  full_name text,
  avatar_url text,
  status public.account_status,
  overall_score numeric,
  attendance_percent numeric,
  task_percent numeric,
  convoy_percent numeric,
  seniority_score numeric,
  attendance_opportunities bigint,
  attendance_points numeric,
  approved_tasks bigint,
  evaluations bigint,
  joined_at timestamptz
)
language sql stable security definer set search_path = public as $$
  with allow_detail as (
    select coalesce(
      (select (value #>> '{}')::boolean from public.app_settings where key = 'leaderboard_visible_to_all'),
      false
    ) as v
  )
  select
    tm.team_id,
    tm.volunteer_id,
    p.full_name,
    p.avatar_url,
    p.status,
    s.overall_score,
    case when public.is_admin() or allow_detail.v
              or exists (select 1 from public.team_leaders tl where tl.team_id = tm.team_id and tl.leader_id = auth.uid())
         then s.attendance_percent end,
    case when public.is_admin() or allow_detail.v
              or exists (select 1 from public.team_leaders tl where tl.team_id = tm.team_id and tl.leader_id = auth.uid())
         then s.task_percent end,
    case when public.is_admin() or allow_detail.v
              or exists (select 1 from public.team_leaders tl where tl.team_id = tm.team_id and tl.leader_id = auth.uid())
         then s.convoy_percent end,
    case when public.is_admin() or allow_detail.v
              or exists (select 1 from public.team_leaders tl where tl.team_id = tm.team_id and tl.leader_id = auth.uid())
         then s.seniority_score end,
    case when public.is_admin() or allow_detail.v
              or exists (select 1 from public.team_leaders tl where tl.team_id = tm.team_id and tl.leader_id = auth.uid())
         then s.attendance_opportunities end,
    case when public.is_admin() or allow_detail.v
              or exists (select 1 from public.team_leaders tl where tl.team_id = tm.team_id and tl.leader_id = auth.uid())
         then s.attendance_points end,
    case when public.is_admin() or allow_detail.v
              or exists (select 1 from public.team_leaders tl where tl.team_id = tm.team_id and tl.leader_id = auth.uid())
         then s.approved_tasks end,
    case when public.is_admin() or allow_detail.v
              or exists (select 1 from public.team_leaders tl where tl.team_id = tm.team_id and tl.leader_id = auth.uid())
         then s.evaluations end,
    tm.joined_at
  from public.team_members tm
  join public.profiles p on p.id = tm.volunteer_id
  left join public.volunteer_scores s on s.volunteer_id = tm.volunteer_id
  cross join allow_detail
  where public.is_admin()
     or tm.team_id in (select team_id from public.team_leaders where leader_id = auth.uid())
     or tm.team_id in (select team_id from public.team_members where volunteer_id = auth.uid());
$$;

create or replace function public.get_score(p_volunteer_id uuid)
returns setof public.volunteer_scores
language sql stable security definer set search_path = public as $$
  select vs.*
  from public.volunteer_scores vs
  where vs.volunteer_id = p_volunteer_id
    and (
      public.is_admin()
      or vs.volunteer_id = auth.uid()
      or exists (
        select 1
        from public.team_members tm
        join public.team_leaders tl on tl.team_id = tm.team_id
        where tm.volunteer_id = vs.volunteer_id and tl.leader_id = auth.uid()
      )
    );
$$;

create or replace function public.get_all_scores()
returns setof public.volunteer_scores
language sql stable security definer set search_path = public as $$
  select vs.*
  from public.volunteer_scores vs
  where public.is_admin();
$$;

-- Profile subset: self, admins, and people who share a team with the
-- caller (as member or leader). Used for name lookups and pickers.
create or replace function public.get_profiles(p_ids uuid[])
returns table(
  id uuid,
  full_name text,
  avatar_url text,
  role public.user_role,
  status public.account_status,
  join_date date,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, p.role, p.status, p.join_date, p.created_at
  from public.profiles p
  where p.id = any(coalesce(p_ids, array[]::uuid[]))
    and (
      public.is_admin()
      or p.id = auth.uid()
      or exists (
        select 1 from public.team_members tm
        where tm.volunteer_id = p.id
          and (
            tm.team_id in (select team_id from public.team_leaders where leader_id = auth.uid())
            or tm.team_id in (select team_id from public.team_members where volunteer_id = auth.uid())
          )
      )
    );
$$;

create or replace function public.get_active_profiles()
returns table(
  id uuid,
  full_name text,
  avatar_url text,
  status public.account_status,
  role public.user_role
)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, p.status, p.role
  from public.profiles p
  where p.status = 'active'
    and (
      public.is_admin()
      or p.id = auth.uid()
      or exists (
        select 1 from public.team_members tm
        where tm.volunteer_id = p.id
          and (
            tm.team_id in (select team_id from public.team_leaders where leader_id = auth.uid())
            or tm.team_id in (select team_id from public.team_members where volunteer_id = auth.uid())
          )
      )
    );
$$;

grant execute on function public.get_team_leaderboard(uuid) to authenticated;
grant execute on function public.get_leaderboard() to authenticated;
grant execute on function public.get_score(uuid) to authenticated;
grant execute on function public.get_all_scores() to authenticated;
grant execute on function public.get_profiles(uuid[]) to authenticated;
grant execute on function public.get_active_profiles() to authenticated;

-- Admin-only helper: full profile list for management pickers
-- (avoids exposing the public_profiles view directly to clients).
create or replace function public.get_management_profiles()
returns table(
  id uuid,
  full_name text,
  avatar_url text,
  role public.user_role,
  status public.account_status,
  join_date date,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, p.role, p.status, p.join_date, p.created_at
  from public.profiles p
  where public.is_admin();
$$;

grant execute on function public.get_management_profiles() to authenticated;

-- RPCs are only ever called from the app with a signed-in JWT; the
-- unauthenticated role gets no EXECUTE on them (the functions also
-- re-check auth internally as defense in depth).
revoke execute on function public.get_team_leaderboard(uuid) from anon;
revoke execute on function public.get_leaderboard() from anon;
revoke execute on function public.get_score(uuid) from anon;
revoke execute on function public.get_all_scores() from anon;
revoke execute on function public.get_profiles(uuid[]) from anon;
revoke execute on function public.get_active_profiles() from anon;
revoke execute on function public.get_management_profiles() from anon;
revoke execute on function public.log_audit(text, text, text, jsonb) from anon;

-- ============================================================
-- AUDIT HARDENING
-- log_audit is SECURITY DEFINER; restrict to an allowlist and to
-- privileged callers so arbitrary rows can no longer be forged.
-- ============================================================
create or replace function public.log_audit(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
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
    'convoy_created', 'convoy_updated', 'convoy_status_changed', 'convoy_deleted',
    'attendance_changed', 'rating_created', 'rating_updated',
    'task_created', 'task_updated', 'task_deleted', 'task_reviewed', 'task_reopened'
  ) then
    raise exception 'Unknown audit action';
  end if;

  if not public.is_admin()
     and not (
       exists (select 1 from public.team_leaders where leader_id = v_uid)
       and p_action in (
         'attendance_changed', 'rating_created', 'rating_updated',
         'task_created', 'task_updated', 'task_deleted', 'task_reviewed', 'task_reopened'
       )
     )
  then
    raise exception 'Not authorized to write audit logs';
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (v_uid, p_action, p_target_type, p_target_id, p_metadata);
end $$;

grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;

-- Only the guarded function may insert into audit_logs; remove the
-- direct-admin insert policy that allowed forging arbitrary entries.
drop policy if exists "audit_write" on public.audit_logs;

-- ============================================================
-- SETTINGS: Super Admin write / public read
-- ============================================================
drop policy if exists "settings_select_admin" on public.app_settings;
drop policy if exists "settings_write_admin" on public.app_settings;
drop policy if exists "settings_update_admin" on public.app_settings;
drop policy if exists "settings_select_all" on public.app_settings;
drop policy if exists "settings_write_super_admin" on public.app_settings;
drop policy if exists "settings_update_super_admin" on public.app_settings;

create policy "settings_select_all" on public.app_settings
  for select to authenticated using (true);
create policy "settings_write_super_admin" on public.app_settings
  for insert to authenticated with check (public.is_super_admin());
create policy "settings_update_super_admin" on public.app_settings
  for update to authenticated using (public.is_super_admin())
  with check (public.is_super_admin());

-- ============================================================
-- CANCELLED CONVOYS ARE IMMUTABLE
-- Attendance and evaluations can only be written while a convoy is
-- upcoming or active (completed and cancelled are both locked).
-- Also adds the missing attendance DELETE policy used by saveAttendance.
-- ============================================================
drop policy if exists "attendance_write" on public.convoy_attendance;
drop policy if exists "attendance_update" on public.convoy_attendance;
drop policy if exists "attendance_delete" on public.convoy_attendance;

create policy "attendance_write" on public.convoy_attendance
  for insert to authenticated with check (
    (public.is_admin() or public.is_team_leader(team_id))
    and exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
  );
create policy "attendance_update" on public.convoy_attendance
  for update to authenticated using (
    (public.is_admin() or public.is_team_leader(team_id))
    and exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
  );
create policy "attendance_delete" on public.convoy_attendance
  for delete to authenticated using (
    (public.is_admin() or public.is_team_leader(team_id))
    and exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
  );

drop policy if exists "evaluations_write" on public.convoy_evaluations;
drop policy if exists "evaluations_update" on public.convoy_evaluations;

create policy "evaluations_write" on public.convoy_evaluations
  for insert to authenticated with check (
    (public.is_admin() or public.is_team_leader(team_id))
    and exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
  );
create policy "evaluations_update" on public.convoy_evaluations
  for update to authenticated using (
    (public.is_admin() or public.is_team_leader(team_id))
    and exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
  );
