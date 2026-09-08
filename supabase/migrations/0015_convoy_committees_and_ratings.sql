-- ============================================================
-- 0015 Committee-based convoys + standing volunteer assessments
--
-- Replaces the legacy team-grouped convoy attendance/evaluation
-- with a committee-based flow:
--
--   1) The super admin chooses WHICH committee leaders attended
--      the convoy (convoy_leaders).
--   2) Each marked leader then logs in and records attendance +
--      ratings only for volunteers of the committees THEY lead
--      (DB-enforced via guard triggers + RLS).
--   3) Super admin keeps "every access": is_admin() bypasses the
--      leader-only checks so the admin can record on behalf of
--      any committee.
--   4) Standing assessments: each roster volunteer (leaders
--      included) may carry a persistent rating (1-5), description
--      and notes on their roster row, editable by admins anytime
--      (independent of convoys).
--
-- Non-destructive. Legacy team columns are left nullable so old
-- (now empty) rows remain structurally valid.
-- ============================================================

-- ---------- Convoy leaders (who attended) ----------
create table public.convoy_leaders (
  convoy_id uuid not null references public.convoys (id) on delete cascade,
  leader_id uuid not null references public.profiles (id) on delete cascade,
  marked_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  primary key (convoy_id, leader_id)
);

create index convoy_leaders_convoy_idx on public.convoy_leaders (convoy_id);
create index convoy_leaders_leader_idx on public.convoy_leaders (leader_id);

-- ---------- Attendance / evaluations become committee-scoped ----------
alter table public.convoy_attendance
  add column committee_id uuid references public.departments (id) on delete cascade;
alter table public.convoy_attendance alter column team_id drop not null;
alter table public.convoy_attendance drop constraint if exists convoy_attendance_convoy_id_volunteer_id_team_id_key;
alter table public.convoy_attendance
  add constraint convoy_attendance_convoy_volunteer_committee_key unique (convoy_id, volunteer_id, committee_id);

alter table public.convoy_evaluations
  add column committee_id uuid references public.departments (id) on delete cascade;
alter table public.convoy_evaluations alter column team_id drop not null;
alter table public.convoy_evaluations drop constraint if exists convoy_evaluations_convoy_id_volunteer_id_team_id_key;
alter table public.convoy_evaluations
  add constraint convoy_evaluations_convoy_volunteer_committee_key unique (convoy_id, volunteer_id, committee_id);

create index idx_attendance_convoy_committee on public.convoy_attendance (convoy_id, committee_id);
create index idx_evaluations_convoy_committee on public.convoy_evaluations (convoy_id, committee_id);

-- ---------- Standing assessment columns on the roster ----------
alter table public.volunteers
  add column if not exists rating smallint check (rating is null or (rating between 1 and 5)),
  add column if not exists description text;

-- ============================================================
-- RLS HELPER: is the caller a marked leader allowed to manage
-- this convoy for this committee?
-- ============================================================
create or replace function public.is_convoy_leader(p_convoy uuid, p_committee uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user()
    and public.is_committee_leader(p_committee)
    and exists (
      select 1 from public.convoy_leaders cl
      where cl.convoy_id = p_convoy and cl.leader_id = auth.uid()
    );
$$;

revoke execute on function public.is_convoy_leader(uuid, uuid) from public, anon;
grant execute on function public.is_convoy_leader(uuid, uuid) to authenticated;

-- ============================================================
-- RLS ENABLE
-- ============================================================
alter table public.convoy_leaders enable row level security;

-- ============================================================
-- POLICIES — CONVOY LEADERS (selection is super-admin only)
-- ============================================================
create policy "convoy_leaders_select" on public.convoy_leaders
  for select to authenticated using (true);
create policy "convoy_leaders_insert_super" on public.convoy_leaders
  for insert to authenticated with check (
    public.is_super_admin()
    and exists (select 1 from public.convoys c where c.id = convoy_id)
  );
create policy "convoy_leaders_delete_super" on public.convoy_leaders
  for delete to authenticated using (public.is_super_admin());

-- ============================================================
-- POLICIES — CONVOY ATTENDANCE (committee-based, replace legacy)
-- ============================================================
drop policy if exists "attendance_select" on public.convoy_attendance;
drop policy if exists "attendance_write" on public.convoy_attendance;
drop policy if exists "attendance_update" on public.convoy_attendance;
drop policy if exists "attendance_delete" on public.convoy_attendance;

create policy "attendance_select" on public.convoy_attendance
  for select to authenticated using (
    volunteer_id = auth.uid() or public.is_admin()
    or public.is_convoy_leader(convoy_id, committee_id)
  );

create policy "attendance_write" on public.convoy_attendance
  for insert to authenticated with check (
    exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
    and (
      public.is_admin()
      or (
        public.is_convoy_leader(convoy_id, committee_id)
        and exists (
          select 1 from public.committee_members cm
          join public.volunteers vv on vv.id = cm.volunteer_id
          where cm.committee_id = public.convoy_attendance.committee_id
            and vv.profile_id = public.convoy_attendance.volunteer_id
        )
      )
    )
  );

create policy "attendance_update" on public.convoy_attendance
  for update to authenticated using (
    exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
    and (
      public.is_admin()
      or (
        public.is_convoy_leader(convoy_id, committee_id)
        and exists (
          select 1 from public.committee_members cm
          join public.volunteers vv on vv.id = cm.volunteer_id
          where cm.committee_id = public.convoy_attendance.committee_id
            and vv.profile_id = public.convoy_attendance.volunteer_id
        )
      )
    )
  );

create policy "attendance_delete" on public.convoy_attendance
  for delete to authenticated using (
    exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
    and (
      public.is_admin()
      or public.is_convoy_leader(convoy_id, committee_id)
    )
  );

-- ============================================================
-- POLICIES — CONVOY EVALUATIONS (committee-based, replace legacy)
-- ============================================================
drop policy if exists "evaluations_select" on public.convoy_evaluations;
drop policy if exists "evaluations_write" on public.convoy_evaluations;
drop policy if exists "evaluations_update" on public.convoy_evaluations;

create policy "evaluations_select" on public.convoy_evaluations
  for select to authenticated using (
    volunteer_id = auth.uid() or leader_id = auth.uid() or public.is_admin()
    or public.is_convoy_leader(convoy_id, committee_id)
  );

create policy "evaluations_write" on public.convoy_evaluations
  for insert to authenticated with check (
    exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
    and (
      public.is_admin()
      or (
        public.is_convoy_leader(convoy_id, committee_id)
        and exists (
          select 1 from public.committee_members cm
          join public.volunteers vv on vv.id = cm.volunteer_id
          where cm.committee_id = public.convoy_evaluations.committee_id
            and vv.profile_id = public.convoy_evaluations.volunteer_id
        )
      )
    )
  );

create policy "evaluations_update" on public.convoy_evaluations
  for update to authenticated using (
    exists (select 1 from public.convoys c where c.id = convoy_id and c.status in ('upcoming', 'active'))
    and (
      public.is_admin()
      or (
        public.is_convoy_leader(convoy_id, committee_id)
        and exists (
          select 1 from public.committee_members cm
          join public.volunteers vv on vv.id = cm.volunteer_id
          where cm.committee_id = public.convoy_evaluations.committee_id
            and vv.profile_id = public.convoy_evaluations.volunteer_id
        )
      )
    )
  );

-- ============================================================
-- GUARD TRIGGERS — leaders may write a committee's data ONLY if
-- they are marked for the convoy AND lead that committee AND the
-- volunteer belongs to it. Admins bypass the leader-only rules.
-- ============================================================
create or replace function public.guard_convoy_attendance_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if not exists (
    select 1 from public.convoys c
    where c.id = new.convoy_id and c.status in ('upcoming', 'active')
  ) then
    raise exception 'Convoy is locked';
  end if;
  if not public.is_convoy_leader(new.convoy_id, new.committee_id) then
    raise exception 'Only marked convoy leaders may write attendance';
  end if;
  if not exists (
    select 1 from public.committee_members cm
    join public.volunteers vv on vv.id = cm.volunteer_id
    where cm.committee_id = new.committee_id and vv.profile_id = new.volunteer_id
  ) then
    raise exception 'Volunteer is not a member of this committee';
  end if;
  return new;
end $$;

drop trigger if exists attendance_guard on public.convoy_attendance;
create trigger attendance_guard before insert or update on public.convoy_attendance
  for each row execute function public.guard_convoy_attendance_write();

create or replace function public.guard_convoy_evaluation_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if not exists (
    select 1 from public.convoys c
    where c.id = new.convoy_id and c.status in ('upcoming', 'active')
  ) then
    raise exception 'Convoy is locked';
  end if;
  if not public.is_convoy_leader(new.convoy_id, new.committee_id) then
    raise exception 'Only marked convoy leaders may write evaluations';
  end if;
  if not exists (
    select 1 from public.committee_members cm
    join public.volunteers vv on vv.id = cm.volunteer_id
    where cm.committee_id = new.committee_id and vv.profile_id = new.volunteer_id
  ) then
    raise exception 'Volunteer is not a member of this committee';
  end if;
  return new;
end $$;

drop trigger if exists evaluations_guard on public.convoy_evaluations;
create trigger evaluations_guard before insert or update on public.convoy_evaluations
  for each row execute function public.guard_convoy_evaluation_write();

-- ============================================================
-- EVALUATION ALLOWED — committee-based rewrite of the legacy
-- teams.eval_mode rule: a volunteer may only be evaluated after
-- being marked present for the same (convoy, committee).
-- ============================================================
drop trigger if exists evaluations_allowed on public.convoy_evaluations;

create or replace function public.check_evaluation_allowed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status public.attendance_status;
begin
  select a.status into v_status
    from public.convoy_attendance a
    where a.convoy_id = new.convoy_id
      and a.volunteer_id = new.volunteer_id
      and a.committee_id = new.committee_id;
  if v_status is distinct from 'present' then
    raise exception 'Volunteer must be marked present to be evaluated';
  end if;
  return new;
end $$;

create trigger evaluations_allowed before insert or update on public.convoy_evaluations
  for each row execute function public.check_evaluation_allowed();

-- ============================================================
-- ASSESSMENT GUARD — keep standing rating/description admin-only
-- (leaders may still edit names/phones/notes of their committee
-- members through the existing volunteers_guard_update).
-- ============================================================
create or replace function public.guard_volunteers_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Trusted contexts with no JWT session (service-role, SQL editor, postgres).
  if auth.uid() is null then
    return new;
  end if;

  if public.is_admin() then
    return new;
  end if;

  if old.profile_id is distinct from new.profile_id
     or old.status is distinct from new.status then
    raise exception 'Only an admin can change the status or account link';
  end if;

  if (old.rating is distinct from new.rating
      or old.description is distinct from new.description) then
    raise exception 'Only an admin can set the rating or description';
  end if;

  if not public.is_committee_leader_of_volunteer(old.id) then
    raise exception 'Only an admin or the committee leader can update this volunteer';
  end if;

  return new;
end $$;

-- ============================================================
-- SCORING — committee-based attendance (replaces the legacy
-- teams view; columns unchanged so get_score / leaderboard
-- functions keep working).
-- ============================================================
create or replace view public.volunteer_scores as
with slots as (
  select
    vol.profile_id as volunteer_id,
    clp.convoy_id,
    cm.committee_id
  from public.committee_members cm
  join public.volunteers vol on vol.id = cm.volunteer_id
  join (
    select distinct convoy_id, committee_id
    from public.convoy_attendance
    where committee_id is not null
  ) clp on clp.committee_id = cm.committee_id
  join public.convoys c on c.id = clp.convoy_id and c.status = 'completed'
  where vol.profile_id is not null
),
attendance as (
  select
    s.volunteer_id,
    count(*) as opportunities,
    count(*) filter (where a.status = 'present') as present_count,
    count(*) filter (where a.status = 'excused') as excused_count,
    count(*) filter (where a.status = 'absent' or a.status is null) as absent_count,
    coalesce(sum(case when a.status = 'present' then 1 when a.status = 'excused' then 0.5 else 0 end), 0) as attendance_points
  from slots s
  left join public.convoy_attendance a
    on a.convoy_id = s.convoy_id and a.committee_id = s.committee_id and a.volunteer_id = s.volunteer_id
  group by s.volunteer_id
),
task_perf as (
  select volunteer_id,
    avg(rating) as avg_rating,
    count(*) as approved_count
  from public.task_assignments
  where status = 'approved' and rating is not null
  group by volunteer_id
),
convoy_perf as (
  select volunteer_id,
    avg(rating) as avg_rating,
    count(*) as eval_count
  from public.convoy_evaluations
  group by volunteer_id
),
seniority as (
  select id as volunteer_id,
    case
      when join_date is null then 0
      else least(10, round((extract(year from age(current_date, join_date)) * 12 + extract(month from age(current_date, join_date))) / 24.0 * 10, 1))
    end as seniority_score
  from public.profiles
)
select
  p.id as volunteer_id,
  coalesce(a.opportunities, 0) as attendance_opportunities,
  coalesce(a.present_count, 0) as present_count,
  coalesce(a.excused_count, 0) as excused_count,
  coalesce(a.absent_count, 0) as absent_count,
  round(coalesce(a.attendance_points, 0), 1) as attendance_points,
  coalesce(tp.approved_count, 0) as approved_tasks,
  coalesce(cp.eval_count, 0) as evaluations,
  round(coalesce(a.attendance_points / nullif(a.opportunities, 0), 0) * 100, 1) as attendance_percent,
  round(coalesce(a.attendance_points / nullif(a.opportunities, 0), 0) * 30, 1) as attendance_score,
  round(coalesce(tp.avg_rating, 0) * 20, 1) as task_percent,
  round(coalesce(tp.avg_rating, 0) / 5 * 30, 1) as task_score,
  round(coalesce(cp.avg_rating, 0) * 20, 1) as convoy_percent,
  round(coalesce(cp.avg_rating, 0) / 5 * 30, 1) as convoy_score,
  coalesce(s.seniority_score, 0) as seniority_score,
  round(
    coalesce(a.attendance_points / nullif(a.opportunities, 0), 0) * 30 +
    coalesce(tp.avg_rating, 0) / 5 * 30 +
    coalesce(cp.avg_rating, 0) / 5 * 30 +
    coalesce(s.seniority_score, 0),
    1
  ) as overall_score,
  p.status as status,
  p.join_date,
  p.created_at
from public.profiles p
left join attendance a on a.volunteer_id = p.id
left join task_perf tp on tp.volunteer_id = p.id
left join convoy_perf cp on cp.volunteer_id = p.id
left join seniority s on s.volunteer_id = p.id;

-- ============================================================
-- AUDIT — extend the whitelist for the committee flow.
-- (Base function: 0006/0009/0013/0014. Non-destructive additions.)
-- ============================================================
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
  v_target_uuid uuid;
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

  -- Safe-cast target_id to uuid when it is a team or volunteer id.
  begin
    v_team_uuid := nullif(p_target_id, '')::uuid;
  exception when others then
    v_team_uuid := null;
  end;
  v_target_uuid := v_team_uuid;

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
    -- A committee leader/deputy may log edits to a volunteer of a committee they lead.
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