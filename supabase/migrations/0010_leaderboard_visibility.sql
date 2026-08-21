-- ============================================================
-- RAS — P3: leaderboard_visible_to_all now opens the whole
-- leaderboard (all teams) at the data layer, not just the
-- caller's own teams.
--
-- Previously get_team_leaderboard() / get_leaderboard() only
-- returned rows for teams the caller leads or belongs to (plus
-- admins). When the "leaderboard_visible_to_all" setting is
-- enabled the UI shows the overall ranking, so both RPCs now
-- also grant row access when that setting is on.
--
-- Detail columns are masked exactly as before: with the setting
-- OFF only admins/team leaders see them; when ON everyone does
-- (the masking CASE already included allow_detail.v).
--
-- Non-destructive: only function definitions change; grants are
-- restated for clarity (create or replace preserves them anyway).
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
    and (public.is_admin() or public.is_team_leader(p_team_id) or public.is_team_member(p_team_id) or allow_detail.v);
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
     or allow_detail.v
     or tm.team_id in (select team_id from public.team_leaders where leader_id = auth.uid())
     or tm.team_id in (select team_id from public.team_members where volunteer_id = auth.uid());
$$;

grant execute on function public.get_team_leaderboard(uuid) to authenticated;
grant execute on function public.get_leaderboard() to authenticated;
