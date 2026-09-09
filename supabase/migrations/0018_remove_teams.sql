-- ============================================================
-- 0018 Remove the legacy teams feature entirely
--
-- The app now runs on committees (departments) and global
-- leaderboards/tasks. This migration removes every team
-- object at the DB layer:
--
--   * team_leaderboard view, get_team_leaderboard(), get_leaderboard()
--   * team helpers (is_team_leader, is_team_member, can_manage_team,
--     led_team_ids), single-team / last-leader triggers
--   * team_id columns on tasks / convoy_attendance / convoy_evaluations
--   * teams, team_members, team_leaders tables + team_eval_mode enum
--
-- Replaces them with committee-based equivalents:
--   * get_global_leaderboard()  (full detail for every logged-in user)
--   * get_score / get_profiles / get_active_profiles scoped to
--     self | admin | committee leader of the profile
--   * tasks owned by admins / committee leaders (created_by-based RLS
--     and is_task_leader())
--
-- The volunteer_scores view is already committee-based (0015) so it
-- is untouched.
-- ============================================================

-- ---------- 1) Drop the legacy team leaderboard view ----------
drop view if exists public.team_leaderboard;

-- ---------- 2) New committee-leader helpers ----------

-- True when the caller is an active volunteer who leads at least
-- one committee.
create or replace function public.is_committee_leader_user()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user()
    and exists (
      select 1
      from public.committee_leaders cl
      join public.volunteers v on v.id = cl.leader_id
      where v.profile_id = auth.uid()
    );
$$;

-- True when the caller leads a committee that the given PROFILE
-- (auth user) is a roster member of.
create or replace function public.is_committee_leader_of_profile(p_profile uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user()
    and exists (
      select 1
      from public.committee_members cm
      join public.volunteers pv on pv.id = cm.volunteer_id
      join public.committee_leaders cl on cl.committee_id = cm.committee_id
      join public.volunteers lv on lv.id = cl.leader_id
      where pv.profile_id = is_committee_leader_of_profile.p_profile
        and lv.profile_id = auth.uid()
    );
$$;

revoke execute on function public.is_committee_leader_user() from public, anon;
revoke execute on function public.is_committee_leader_of_profile(uuid) from public, anon;
grant execute on function public.is_committee_leader_user() to authenticated;
grant execute on function public.is_committee_leader_of_profile(uuid) to authenticated;

-- ---------- 3) Rework profile / score RPCs (no teams) ----------

create or replace function public.get_score(p_volunteer_id uuid)
returns setof public.volunteer_scores
language sql stable security definer set search_path = public as $$
  select vs.*
  from public.volunteer_scores vs
  where vs.volunteer_id = p_volunteer_id
    and (
      vs.volunteer_id = auth.uid()
      or public.is_admin()
      or public.is_committee_leader_of_profile(p_volunteer_id)
    );
$$;

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
      p.id = auth.uid()
      or public.is_admin()
      or public.is_committee_leader_of_profile(p.id)
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
      p.id = auth.uid()
      or public.is_admin()
      or (
        public.is_committee_leader_user()
        and exists (
          select 1
          from public.committee_members cm
          join public.volunteers vv on vv.id = cm.volunteer_id
          where vv.profile_id = p.id
            and cm.committee_id = any(public.led_committee_ids())
        )
      )
    );
$$;

-- ---------- 4) Global leaderboard (full detail for everyone) ----------

drop function if exists public.get_team_leaderboard(uuid);
drop function if exists public.get_leaderboard();

create or replace function public.get_global_leaderboard()
returns table(
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
  select
    p.id,
    p.full_name,
    p.avatar_url,
    p.status,
    s.overall_score,
    s.attendance_percent,
    s.task_percent,
    s.convoy_percent,
    s.seniority_score,
    s.attendance_opportunities,
    s.attendance_points,
    s.approved_tasks,
    s.evaluations,
    p.join_date::timestamptz
  from public.profiles p
  left join public.volunteer_scores s on s.volunteer_id = p.id;
$$;

revoke execute on function public.get_global_leaderboard() from public, anon;
grant execute on function public.get_global_leaderboard() to authenticated;

-- ---------- 5) Task helper: leader = admin OR task author ----------

create or replace function public.is_task_leader(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
    or (
      public.is_active_user()
      and exists (
        select 1 from public.tasks t
        where t.id = p_task_id and t.created_by = auth.uid()
      )
    );
$$;

-- Drop legacy team helpers (no longer referenced anywhere).
drop function if exists public.is_team_leader(uuid);
drop function if exists public.is_team_member(uuid);
drop function if exists public.can_manage_team(uuid);
drop function if exists public.led_team_ids();
drop function if exists public.check_leader_single_team();
drop function if exists public.guard_team_leader_delete();

-- ---------- 6) TASKS RLS — global tasks (no team_id) ----------

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select to authenticated using (
    public.is_admin()
    or (created_by = auth.uid() and public.is_active_user())
    or public.is_assigned_task(id)
  );

drop policy if exists "tasks_write" on public.tasks;
create policy "tasks_write" on public.tasks
  for insert to authenticated with check (
    public.is_admin()
    or (
      created_by = auth.uid()
      and public.is_active_user()
      and public.is_committee_leader_user()
    )
  );

drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update to authenticated using (
    public.is_admin()
    or (created_by = auth.uid() and public.is_active_user())
  );

drop policy if exists "tasks_delete" on public.tasks;
create policy "tasks_delete" on public.tasks
  for delete to authenticated using (
    public.is_admin()
    or (created_by = auth.uid() and public.is_active_user())
  );

-- ---------- 7) TASK ASSIGNMENTS INSERT guard — committee rules ----------
-- (assignments_select / insert / update_leader / delete reuse the
-- reworked is_task_leader() and need no changes.)

create or replace function public.guard_task_assignment_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_target_active boolean;
begin
  -- Trusted contexts (service-role, SQL editor, postgres) are exempt.
  if auth.uid() is null then
    return new;
  end if;

  -- The target must exist and be active (no assigning banned/inactive volunteers).
  select (status = 'active') into v_target_active
    from public.profiles where id = new.volunteer_id;
  if v_target_active is null then
    raise exception 'Assignment target does not exist';
  end if;
  if not v_target_active then
    raise exception 'Cannot assign a non-active volunteer';
  end if;

  -- Admins may assign any active volunteer to any task.
  if public.is_admin() then
    return new;
  end if;

  -- Non-admin actors must be committee leaders.
  if not public.is_committee_leader_user() then
    raise exception 'Only a committee leader can assign tasks';
  end if;

  -- And the target must belong to a committee the caller leads (or be
  -- the caller themselves).
  if new.volunteer_id <> auth.uid()
     and not exists (
       select 1
       from public.volunteers tv
       join public.committee_members cm on cm.volunteer_id = tv.id
       where tv.profile_id = new.volunteer_id
         and cm.committee_id = any(public.led_committee_ids())
     ) then
    raise exception 'not in a committee you lead';
  end if;

  return new;
end $$;

drop trigger if exists assignments_insert_guard on public.task_assignments;
create trigger assignments_insert_guard
  before insert on public.task_assignments
  for each row execute function public.guard_task_assignment_insert();

-- ---------- 8) PROFILES SELECT — committee-leader access ----------

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to authenticated using (
    id = auth.uid() or public.is_admin()
    or public.is_committee_leader_of_profile(id)
  );

-- ---------- 9) AUDIT — drop team actions, committee-leader branch ----------

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
  v_target_uuid uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_action not in (
    'user_created', 'user_banned', 'user_unbanned', 'user_role_changed',
    'award_created', 'award_deleted', 'warning_issued', 'warning_deleted',
    'settings_updated', 'profile_updated',
    'convoy_created', 'convoy_updated', 'convoy_status_changed', 'convoy_deleted',
    'attendance_changed', 'rating_created', 'rating_updated',
    'task_created', 'task_updated', 'task_deleted', 'task_reviewed', 'task_reopened',
    'volunteer_created', 'volunteer_updated', 'volunteer_status_changed',
    'volunteer_profile_linked', 'volunteer_deleted',
    'department_created', 'department_updated', 'department_deleted',
    'committee_leader_set', 'committee_leader_removed',
    'leader_impersonation_started', 'leader_impersonation_ended',
    'convoy_leaders_updated', 'volunteer_rating_updated'
  ) then
    raise exception 'Unknown audit action';
  end if;

  -- Safe-cast target_id to uuid when it is a volunteer id.
  begin
    v_target_uuid := nullif(p_target_id, '')::uuid;
  exception when others then
    v_target_uuid := null;
  end;

  if public.is_admin()
    -- A committee leader may log attendance/rating/task actions.
    or (
      public.is_active_user()
      and exists (
        select 1
        from public.committee_leaders cl
        join public.volunteers v on v.id = cl.leader_id
        where v.profile_id = v_uid
      )
      and p_action in (
        'attendance_changed', 'rating_created', 'rating_updated',
        'task_created', 'task_updated', 'task_deleted', 'task_reviewed', 'task_reopened'
      )
    )
    -- A committee leader/deputy may log edits to a volunteer of a
    -- committee they lead.
    or (
      p_action = 'volunteer_updated'
      and v_target_uuid is not null
      and public.is_active_user()
      and exists (
        select 1
        from public.volunteers vt
        join public.committee_members cm on cm.volunteer_id = vt.id
        join public.committee_leaders cl on cl.committee_id = cm.committee_id
        join public.volunteers vme on vme.id = cl.leader_id
        where vt.id = v_target_uuid
          and vme.profile_id = v_uid
      )
    )
    -- Department + leadership writes are reserved for super admins.
    or (
      p_action in (
        'department_created', 'department_updated', 'department_deleted',
        'committee_leader_set', 'committee_leader_removed'
      )
      and public.is_super_admin()
    )
    -- Leader impersonation is reserved for super admins.
    or (
      p_action in ('leader_impersonation_started', 'leader_impersonation_ended')
      and public.is_super_admin()
    )
    -- Super admins choose which leaders attended a convoy.
    or (
      p_action = 'convoy_leaders_updated'
      and public.is_super_admin()
    )
    -- Standing ratings/descriptions are admin-only.
    or (
      p_action = 'volunteer_rating_updated'
      and public.is_admin()
    )
  then
    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (v_uid, p_action, p_target_type, p_target_id, p_metadata);
  else
    raise exception 'Not authorized to write audit logs';
  end if;
end $$;

-- ---------- 10) Drop team_id columns + legacy indexes ----------

drop index if exists public.idx_tasks_team;
alter table public.tasks drop column if exists team_id;

drop index if exists public.idx_attendance_convoy_team;
alter table public.convoy_attendance drop column if exists team_id;

alter table public.convoy_evaluations drop column if exists team_id;

-- Unused leaderboard-visibility setting introduced for the teams era.
delete from public.app_settings where key = 'leaderboard_visible_to_all';

-- ---------- 11) Drop legacy team tables + enum ----------

drop trigger if exists leaders_single_team on public.team_leaders;
drop trigger if exists leaders_delete_guard on public.team_leaders;

drop table if exists public.team_leaders;
drop table if exists public.team_members;
drop table if exists public.teams;
drop type if exists public.team_eval_mode;

-- ---------- 12) Restate RPC grants (0015/0016 dependents) ----------

revoke execute on function public.get_score(uuid) from public, anon;
grant execute on function public.get_score(uuid) to authenticated;
revoke execute on function public.get_profiles(uuid[]) from public, anon;
grant execute on function public.get_profiles(uuid[]) to authenticated;
revoke execute on function public.get_active_profiles() from public, anon;
grant execute on function public.get_active_profiles() to authenticated;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;