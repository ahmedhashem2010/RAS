-- ============================================================
-- RAS — Resala Administration System
-- Initial schema, functions, RLS and triggers
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type user_role as enum ('volunteer', 'general_admin', 'super_admin');
create type account_status as enum ('active', 'banned');
create type convoy_type as enum ('normal', 'mini_camp', 'full_camp');
create type convoy_status as enum ('upcoming', 'active', 'completed', 'cancelled');
create type attendance_status as enum ('present', 'excused', 'absent');
create type task_status as enum ('pending', 'in_progress', 'submitted', 'approved', 'rejected');
create type award_type as enum ('volunteer_of_day', 'best_leader');
create type team_eval_mode as enum ('attendance', 'media_work');

-- ============================================================
-- TABLES
-- ============================================================

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text not null default '#0d9488',
  eval_mode team_eval_mode not null default 'attendance',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  avatar_url text,
  phone text,
  email text,
  age int check (age is null or (age >= 10 and age <= 120)),
  join_date date,
  role user_role not null default 'volunteer',
  status account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (team_id, volunteer_id)
);

create table public.team_leaders (
  team_id uuid not null references public.teams (id) on delete cascade,
  leader_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (team_id, leader_id)
);

create table public.convoys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type convoy_type not null default 'normal',
  start_date date not null,
  end_date date not null,
  location text,
  description text,
  instructions text,
  status convoy_status not null default 'upcoming',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.convoy_attendance (
  id uuid primary key default gen_random_uuid(),
  convoy_id uuid not null references public.convoys (id) on delete cascade,
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  status attendance_status not null,
  marked_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (convoy_id, volunteer_id, team_id)
);

create table public.convoy_evaluations (
  id uuid primary key default gen_random_uuid(),
  convoy_id uuid not null references public.convoys (id) on delete cascade,
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  leader_id uuid not null references public.profiles (id),
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (convoy_id, volunteer_id, team_id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  team_id uuid references public.teams (id) on delete cascade,
  deadline date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_assignments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  status task_status not null default 'pending',
  proof_url text,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rating smallint check (rating is null or (rating between 1 and 5)),
  review_comment text,
  created_at timestamptz not null default now(),
  unique (task_id, volunteer_id)
);

create table public.awards (
  id uuid primary key default gen_random_uuid(),
  type award_type not null,
  recipient_id uuid not null references public.profiles (id),
  convoy_id uuid references public.convoys (id) on delete set null,
  event_name text,
  award_date date not null default current_date,
  given_by uuid not null references public.profiles (id),
  reason text,
  created_at timestamptz not null default now()
);

create table public.warnings (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references public.profiles (id) on delete cascade,
  number int not null,
  warning_date date not null default current_date,
  issued_by uuid not null references public.profiles (id),
  reason text not null check (length(trim(reason)) > 0),
  convoy_id uuid references public.convoys (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  data jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_team_members_volunteer on public.team_members (volunteer_id);
create index idx_team_members_team on public.team_members (team_id);
create index idx_team_leaders_leader on public.team_leaders (leader_id);
create index idx_convoys_status_date on public.convoys (status, start_date);
create index idx_attendance_convoy_team on public.convoy_attendance (convoy_id, team_id);
create index idx_attendance_volunteer on public.convoy_attendance (volunteer_id);
create index idx_evaluations_convoy on public.convoy_evaluations (convoy_id);
create index idx_evaluations_volunteer on public.convoy_evaluations (volunteer_id);
create index idx_tasks_team on public.tasks (team_id);
create index idx_assignments_volunteer on public.task_assignments (volunteer_id);
create index idx_assignments_task on public.task_assignments (task_id);
create index idx_assignments_status on public.task_assignments (status);
create index idx_warnings_volunteer on public.warnings (volunteer_id);
create index idx_notifications_user on public.notifications (user_id, read);
create index idx_notifications_created on public.notifications (created_at desc);
create index idx_audit_created on public.audit_logs (created_at desc);

-- ============================================================
-- RLS HELPER FUNCTIONS
-- ============================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('general_admin', 'super_admin') and status = 'active'
  );
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin' and status = 'active'
  );
$$;

create or replace function public.is_team_leader(team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_leaders
    where leader_id = auth.uid() and team_id = is_team_leader.team_id
  );
$$;

create or replace function public.is_team_member(team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.team_members
    where volunteer_id = auth.uid() and team_id = is_team_member.team_id
  );
$$;

create or replace function public.can_manage_team(team_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or public.is_team_leader(team_id);
$$;

-- Teams the current user leads
create or replace function public.led_team_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(team_id), array[]::uuid[])
  from public.team_leaders where leader_id = auth.uid();
$$;

-- ============================================================
-- SCORING VIEW
-- ============================================================
-- Attendance opportunities = for each completed convoy and each of the
-- volunteer's attendance-mode teams that participated in it (a team
-- participates when it has attendance records). Missing records count as absent.
create or replace view public.volunteer_scores as
with attendance as (
  select
    v.id as volunteer_id,
    count(*) as opportunities,
    count(*) filter (where a.status = 'present') as present_count,
    count(*) filter (where a.status = 'excused') as excused_count,
    count(*) filter (where a.status = 'absent' or a.status is null) as absent_count,
    coalesce(sum(case when a.status = 'present' then 1 when a.status = 'excused' then 0.5 else 0 end), 0) as attendance_points
  from public.profiles v
  join public.team_members tm on tm.volunteer_id = v.id
  join public.teams t on t.id = tm.team_id and t.eval_mode = 'attendance'
  join public.convoys c on c.status = 'completed'
  join public.convoy_attendance team_part on team_part.convoy_id = c.id and team_part.team_id = t.id
  left join public.convoy_attendance a
    on a.convoy_id = c.id and a.team_id = t.id and a.volunteer_id = v.id
  group by v.id
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

-- Public, safe subset of profiles (leaderboard names/avatars only)
create or replace view public.public_profiles as
select id, full_name, avatar_url, role, status, join_date, created_at
from public.profiles;

-- ============================================================
-- GRANTS (views & functions; tables use default authenticated grants + RLS)
-- ============================================================
grant select on public.public_profiles to authenticated;
grant select on public.volunteer_scores to authenticated;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_team_leader(uuid) to authenticated;
grant execute on function public.is_team_member(uuid) to authenticated;
grant execute on function public.can_manage_team(uuid) to authenticated;
grant execute on function public.led_team_ids() to authenticated;

-- ============================================================
-- RLS ENABLE
-- ============================================================
alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.team_leaders enable row level security;
alter table public.convoys enable row level security;
alter table public.convoy_attendance enable row level security;
alter table public.convoy_evaluations enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.awards enable row level security;
alter table public.warnings enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- ============================================================
-- POLICIES — TEAMS
-- ============================================================
create policy "teams_select_all" on public.teams
  for select to authenticated using (true);
create policy "teams_insert_admin" on public.teams
  for insert to authenticated with check (public.is_admin());
create policy "teams_update_admin" on public.teams
  for update to authenticated using (public.is_admin());
create policy "teams_delete_admin" on public.teams
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- POLICIES — PROFILES
-- Full profile: owner, admins, and leaders of teams the volunteer belongs to.
-- ============================================================
create policy "profiles_select" on public.profiles
  for select to authenticated using (
    id = auth.uid() or public.is_admin()
    or exists (
      select 1 from public.team_leaders tl
      join public.team_members tm on tm.team_id = tl.team_id
      where tl.leader_id = auth.uid() and tm.volunteer_id = public.profiles.id
    )
  );
create policy "profiles_insert" on public.profiles
  for insert to authenticated with check (id = auth.uid() or public.is_admin());
create policy "profiles_update" on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());
create policy "profiles_delete_admin" on public.profiles
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- POLICIES — TEAM MEMBERS
-- ============================================================
create policy "members_select" on public.team_members
  for select to authenticated using (
    volunteer_id = auth.uid() or public.is_admin()
    or exists (
      select 1 from public.team_leaders tl
      where tl.team_id = public.team_members.team_id and tl.leader_id = auth.uid()
    )
  );
create policy "members_write_admin" on public.team_members
  for insert to authenticated with check (public.is_admin());
create policy "members_update_admin" on public.team_members
  for update to authenticated using (public.is_admin());
create policy "members_delete_admin" on public.team_members
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- POLICIES — TEAM LEADERS
-- ============================================================
create policy "leaders_select" on public.team_leaders
  for select to authenticated using (true);
create policy "leaders_write_admin" on public.team_leaders
  for insert to authenticated with check (public.is_admin());
create policy "leaders_update_admin" on public.team_leaders
  for update to authenticated using (public.is_admin());
create policy "leaders_delete_admin" on public.team_leaders
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- POLICIES — CONVOYS
-- ============================================================
create policy "convoys_select" on public.convoys
  for select to authenticated using (true);
create policy "convoys_write_admin" on public.convoys
  for insert to authenticated with check (public.is_admin());
create policy "convoys_update_admin" on public.convoys
  for update to authenticated using (public.is_admin());
create policy "convoys_delete_admin" on public.convoys
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- POLICIES — CONVOY ATTENDANCE
-- ============================================================
create policy "attendance_select" on public.convoy_attendance
  for select to authenticated using (
    volunteer_id = auth.uid() or public.is_admin()
    or exists (
      select 1 from public.team_leaders tl
      where tl.team_id = public.convoy_attendance.team_id and tl.leader_id = auth.uid()
    )
  );
create policy "attendance_write" on public.convoy_attendance
  for insert to authenticated with check (
    (public.is_admin() or public.is_team_leader(team_id))
    and exists (select 1 from public.convoys c where c.id = convoy_id and c.status <> 'completed')
  );
create policy "attendance_update" on public.convoy_attendance
  for update to authenticated using (
    (public.is_admin() or public.is_team_leader(team_id))
    and exists (select 1 from public.convoys c where c.id = convoy_id and c.status <> 'completed')
  );

-- ============================================================
-- POLICIES — CONVOY EVALUATIONS
-- ============================================================
create policy "evaluations_select" on public.convoy_evaluations
  for select to authenticated using (
    volunteer_id = auth.uid() or leader_id = auth.uid() or public.is_admin()
    or exists (
      select 1 from public.team_leaders tl
      where tl.team_id = public.convoy_evaluations.team_id and tl.leader_id = auth.uid()
    )
  );
create policy "evaluations_write" on public.convoy_evaluations
  for insert to authenticated with check (
    (public.is_admin() or public.is_team_leader(team_id))
    and exists (select 1 from public.convoys c where c.id = convoy_id and c.status <> 'completed')
  );
create policy "evaluations_update" on public.convoy_evaluations
  for update to authenticated using (
    (public.is_admin() or public.is_team_leader(team_id))
    and exists (select 1 from public.convoys c where c.id = convoy_id and c.status <> 'completed')
  );

-- ============================================================
-- POLICIES — TASKS
-- ============================================================
create policy "tasks_select" on public.tasks
  for select to authenticated using (
    public.is_admin()
    or (team_id is not null and (
        public.is_team_leader(team_id) or public.is_team_member(team_id)))
    or created_by = auth.uid()
    or exists (select 1 from public.task_assignments ta where ta.task_id = public.tasks.id and ta.volunteer_id = auth.uid())
  );
create policy "tasks_write" on public.tasks
  for insert to authenticated with check (
    public.is_admin()
    or (team_id is not null and public.is_team_leader(team_id))
  );
create policy "tasks_update" on public.tasks
  for update to authenticated using (
    public.is_admin()
    or (team_id is not null and public.is_team_leader(team_id))
  );
create policy "tasks_delete" on public.tasks
  for delete to authenticated using (
    public.is_admin()
    or (team_id is not null and public.is_team_leader(team_id))
  );

-- ============================================================
-- POLICIES — TASK ASSIGNMENTS
-- ============================================================
create policy "assignments_select" on public.task_assignments
  for select to authenticated using (
    volunteer_id = auth.uid() or public.is_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = public.task_assignments.task_id
        and t.team_id is not null and public.is_team_leader(t.team_id)
    )
  );
create policy "assignments_insert" on public.task_assignments
  for insert to authenticated with check (
    public.is_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = public.task_assignments.task_id
        and t.team_id is not null and public.is_team_leader(t.team_id)
    )
  );
-- Volunteers may update their own rows; leaders/admins may update their team rows.
create policy "assignments_update_self" on public.task_assignments
  for update to authenticated using (volunteer_id = auth.uid());
create policy "assignments_update_leader" on public.task_assignments
  for update to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = public.task_assignments.task_id
        and t.team_id is not null and public.is_team_leader(t.team_id)
    )
  );
create policy "assignments_delete" on public.task_assignments
  for delete to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = public.task_assignments.task_id
        and t.team_id is not null and public.is_team_leader(t.team_id)
    )
  );

-- ============================================================
-- POLICIES — AWARDS
-- ============================================================
create policy "awards_select" on public.awards
  for select to authenticated using (true);
create policy "awards_write" on public.awards
  for insert to authenticated with check (public.is_admin());
create policy "awards_update" on public.awards
  for update to authenticated using (public.is_admin());
create policy "awards_delete" on public.awards
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- POLICIES — WARNINGS
-- ============================================================
create policy "warnings_select" on public.warnings
  for select to authenticated using (volunteer_id = auth.uid() or public.is_admin());
create policy "warnings_write" on public.warnings
  for insert to authenticated with check (public.is_admin());
create policy "warnings_update" on public.warnings
  for update to authenticated using (public.is_admin());
create policy "warnings_delete" on public.warnings
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- POLICIES — NOTIFICATIONS
-- ============================================================
create policy "notifications_select" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update" on public.notifications
  for update to authenticated using (user_id = auth.uid());
create policy "notifications_delete" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- POLICIES — AUDIT LOGS
-- ============================================================
create policy "audit_select" on public.audit_logs
  for select to authenticated using (public.is_admin());
create policy "audit_write" on public.audit_logs
  for insert to authenticated with check (public.is_admin());

-- ============================================================
-- TRIGGER FUNCTIONS
-- ============================================================

-- New auth user -> profile row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profile email in sync with auth
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.sync_profile_email();

-- updated_at helpers
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger convoys_touch before update on public.convoys
  for each row execute function public.touch_updated_at();
create trigger attendance_touch before update on public.convoy_attendance
  for each row execute function public.touch_updated_at();
create trigger evaluations_touch before update on public.convoy_evaluations
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- A person cannot lead two different teams
create or replace function public.check_leader_single_team()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.team_leaders
    where leader_id = new.leader_id and team_id <> new.team_id
  ) then
    raise exception 'A volunteer cannot lead more than one team';
  end if;
  return new;
end $$;

create trigger leaders_single_team before insert on public.team_leaders
  for each row execute function public.check_leader_single_team();

-- Evaluations: only for present volunteers in attendance-mode teams;
-- media-mode teams may evaluate based on produced work regardless of attendance.
create or replace function public.check_evaluation_allowed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mode public.team_eval_mode;
  v_status public.attendance_status;
begin
  select t.eval_mode into v_mode from public.teams t where t.id = new.team_id;
  if v_mode = 'attendance' then
    select a.status into v_status from public.convoy_attendance a
      where a.convoy_id = new.convoy_id
        and a.volunteer_id = new.volunteer_id
        and a.team_id = new.team_id;
    if v_status is distinct from 'present' then
      raise exception 'Volunteer must be marked present to be evaluated';
    end if;
  end if;
  return new;
end $$;

create trigger evaluations_allowed before insert or update on public.convoy_evaluations
  for each row execute function public.check_evaluation_allowed();

-- Volunteers cannot tamper with review fields on their own task assignments
create or replace function public.guard_task_assignment_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.volunteer_id = auth.uid() then
    new.reviewed_by = old.reviewed_by;
    new.reviewed_at = old.reviewed_at;
    new.rating = old.rating;
    new.review_comment = old.review_comment;
  end if;
  return new;
end $$;

create trigger assignments_guard before update on public.task_assignments
  for each row execute function public.guard_task_assignment_update();

-- ============================================================
-- NOTIFICATION TRIGGERS
-- ============================================================
create or replace function public.push_notification(
  target_user uuid, p_type text, p_title text, p_body text, p_data jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  values (target_user, p_type, p_title, p_body, p_data);
end $$;

grant execute on function public.push_notification(uuid, text, text, text, jsonb) to authenticated;

-- Task assigned
create or replace function public.notify_task_assigned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  select title into v_title from public.tasks where id = new.task_id;
  perform public.push_notification(
    new.volunteer_id, 'task_assigned', 'مهمة جديدة',
    'تم تكليفك بمهمة: ' || v_title
  );
  return new;
end $$;

create trigger notify_task_assigned after insert on public.task_assignments
  for each row execute function public.notify_task_assigned();

-- Task approved / rejected
create or replace function public.notify_task_reviewed()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_title text;
begin
  if new.status in ('approved', 'rejected') and new.status is distinct from old.status then
    select title into v_title from public.tasks where id = new.task_id;
    if new.status = 'approved' then
      perform public.push_notification(
        new.volunteer_id, 'task_approved', 'تم قبول المهمة',
        'تم قبول مهمتك: ' || v_title || coalesce(' — ' || new.review_comment, '')
      );
    else
      perform public.push_notification(
        new.volunteer_id, 'task_rejected', 'تم رفض المهمة',
        'تم رفض مهمتك: ' || v_title || coalesce(' — ' || new.review_comment, '')
      );
    end if;
  end if;
  return new;
end $$;

create trigger notify_task_reviewed after update on public.task_assignments
  for each row execute function public.notify_task_reviewed();

-- Volunteer submitted a task -> notify the task creator (team leader)
create or replace function public.notify_task_submitted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'submitted' and new.status is distinct from old.status then
    perform public.push_notification(
      (select created_by from public.tasks where id = new.task_id),
      'task_submitted', 'تسليم مهمة',
      'قام أحد المتطوعين بتسليم مهمة للمراجعة'
    );
  end if;
  return new;
end $$;

create trigger notify_task_submitted after update on public.task_assignments
  for each row execute function public.notify_task_submitted();

-- New convoy -> notify everyone
create or replace function public.notify_convoy_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, type, title, body, data)
  select p.id, 'convoy_created', 'قافلة جديدة',
         'تم إنشاء قافلة جديدة: ' || new.name,
         jsonb_build_object('convoy_id', new.id)
  from public.profiles p where p.status = 'active';
  return new;
end $$;

create trigger notify_convoy_created after insert on public.convoys
  for each row execute function public.notify_convoy_created();

-- New rating
create or replace function public.notify_evaluated()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notification(
    new.volunteer_id, 'rating_added', 'تقييم جديد',
    'تم إضافة تقييم أداء جديد لك بقيمة ' || new.rating || ' من 5'
  );
  return new;
end $$;

create trigger notify_evaluated after insert on public.convoy_evaluations
  for each row execute function public.notify_evaluated();

-- New award
create or replace function public.notify_awarded()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  v_label := case new.type when 'volunteer_of_day' then 'المتطوع المثالي' else 'أفضل قائد' end;
  perform public.push_notification(
    new.recipient_id, 'award', 'تهانينا 🏅',
    'تم اختيارك كـ ' || v_label
  );
  return new;
end $$;

create trigger notify_awarded after insert on public.awards
  for each row execute function public.notify_awarded();

-- New warning
create or replace function public.notify_warned()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notification(
    new.volunteer_id, 'warning', 'إنذار',
    'تم تسجيل إنذار رقم ' || new.number || ' ضدك'
  );
  return new;
end $$;

create trigger notify_warned after insert on public.warnings
  for each row execute function public.notify_warned();
