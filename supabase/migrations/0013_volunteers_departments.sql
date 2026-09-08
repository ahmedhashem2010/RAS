-- ============================================================
-- RAS — Volunteers Management System
--
-- Adds committees (اللجان), the volunteer roster, committee
-- membership and committee leadership with database-level access
-- control and audit. Separated from the existing `teams` model
-- (field teams used by attendance / scoring / leaderboard).
--
-- MODEL
--   departments       the 11 fixed committees (media, lab, ...)
--   volunteers        the roster PERSON (may or may not have a
--                     Supabase Auth account yet).
--   committee_members which committees a volunteer belongs to.
--   committee_leaders leadership rows: a committee may have MULTIPLE
--                     leaders and at most ONE deputy (partial unique
--                     index). A volunteer may lead several committees
--                     (real data: د. حاتم سامح leads Campaign and
--                     Doctors), which is why leadership is NOT tied
--                     to the teams "one leader per team" rule.
--
-- IDENTITY
--   volunteers.profile_id is NOT unique: a roster person may be
--   present in several committees while sharing one Auth account.
--   E.g. a leader who belongs to two committees keeps several roster
--   rows referencing the same profile. Passwords are NEVER stored
--   here; they live in Supabase Auth.
--
-- SEARCH
--   volunteers.search_name is a normalized (case + Arabic
--   hamza/ة/ى) copy of full_name fed by a trigger, indexed with
--   pg_trgm for fast Arabic partial search.
--
-- PERMISSIONS (enforced in the DB, never by hiding buttons)
--   Super admin .... full control: volunteers, membership,
--                    leadership, departments, permanent delete
--   General admin ... manage volunteers (create / update / assign
--                    members to committees / deactivate); NO
--                    leadership or department writes
--   Leader/Deputy .. SELECT + limited UPDATE (full_name, phone,
--                    notes) of volunteers in the committees they
--                    lead; cannot move committees / change status /
--                    alter leadership
--   Volunteer ...... SELECT own roster rows only
--
-- Non-destructive: no DROP TABLE / TRUNCATE / DELETE of data.
-- ============================================================

-- ---------- Extensions ----------
create extension if not exists pg_trgm;

-- ---------- Enums ----------
create type volunteer_status as enum ('active', 'inactive');

-- ---------- Committees ----------
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  name_en text not null unique,
  description text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- profiles: first-login onboarding flag ----------
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- ---------- Volunteer roster ----------
create table public.volunteers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles (id) on delete set null,
  full_name text not null,
  search_name text not null,
  phone text,
  notes text,
  status volunteer_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(trim(full_name)) > 0)
);

create index volunteers_search_idx on public.volunteers using gin (search_name gin_trgm_ops);
create index volunteers_profile_idx on public.volunteers (profile_id);
create index volunteers_status_idx on public.volunteers (status);

-- ---------- Committee membership ----------
create table public.committee_members (
  committee_id uuid not null references public.departments (id) on delete cascade,
  volunteer_id uuid not null references public.volunteers (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (committee_id, volunteer_id)
);

create index committee_members_volunteer_idx on public.committee_members (volunteer_id);

-- ---------- Committee leadership ----------
-- PK (committee_id, leader_id) forbids a person being BOTH leader and
-- deputy of the same committee; the partial index forbids two deputies.
create table public.committee_leaders (
  committee_id uuid not null references public.departments (id) on delete cascade,
  leader_id uuid not null references public.volunteers (id) on delete cascade,
  is_deputy boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (committee_id, leader_id)
);

create unique index committee_single_deputy on public.committee_leaders (committee_id) where is_deputy;
create index committee_leaders_leader_idx on public.committee_leaders (leader_id);

-- ============================================================
-- ARABIC SEARCH NORMALIZATION
-- ============================================================
create or replace function public.volunteer_search_name(p_name text)
returns text language sql immutable set search_path = public as $$
  select lower(
    translate(
      regexp_replace(coalesce(p_name, ''), '[ًٌٍَُِّْـ]', '', 'g'),
      'أإآىةؤئ',
      'ااايهوي'
    )
  );
$$;

revoke execute on function public.volunteer_search_name(text) from public, anon;
grant execute on function public.volunteer_search_name(text) to authenticated;

create or replace function public.set_volunteer_search_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.search_name := public.volunteer_search_name(new.full_name);
  return new;
end $$;

create trigger volunteers_search
  before insert or update of full_name on public.volunteers
  for each row execute function public.set_volunteer_search_name();

-- ============================================================
-- RLS HELPERS
-- ============================================================
create or replace function public.is_committee_leader(committee_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user()
    and exists (
      select 1
      from public.committee_leaders cl
      join public.volunteers v on v.id = cl.leader_id
      where cl.committee_id = is_committee_leader.committee_id
        and v.profile_id = auth.uid()
    );
$$;

-- True when the caller leads at least one committee this volunteer
-- belongs to (a leader sees their committee members).
create or replace function public.is_committee_leader_of_volunteer(p_volunteer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user()
    and exists (
      select 1
      from public.committee_members cm
      where cm.volunteer_id = p_volunteer
        and exists (
          select 1
          from public.committee_leaders cl
          join public.volunteers v on v.id = cl.leader_id
          where cl.committee_id = cm.committee_id
            and v.profile_id = auth.uid()
        )
    );
$$;

-- True when the caller is this volunteer (roster row linked to their account).
create or replace function public.is_committee_member(p_volunteer uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active_user()
    and exists (
      select 1 from public.volunteers v
      where v.id = p_volunteer and v.profile_id = auth.uid()
    );
$$;

create or replace function public.led_committee_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(cl.committee_id), array[]::uuid[])
  from public.committee_leaders cl
  join public.volunteers v on v.id = cl.leader_id
  where v.profile_id = auth.uid();
$$;

revoke execute on function public.is_committee_leader(uuid) from public, anon;
revoke execute on function public.is_committee_leader_of_volunteer(uuid) from public, anon;
revoke execute on function public.is_committee_member(uuid) from public, anon;
revoke execute on function public.led_committee_ids() from public, anon;

grant execute on function public.is_committee_leader(uuid) to authenticated;
grant execute on function public.is_committee_leader_of_volunteer(uuid) to authenticated;
grant execute on function public.is_committee_member(uuid) to authenticated;
grant execute on function public.led_committee_ids() to authenticated;

-- ============================================================
-- VOLUNTEER UPDATE GUARD
-- Only an admin may change profile link / status. A leader/deputy may
-- change name / phone / notes of volunteers in the committees they led.
-- RLS already limits the rows; this trigger enforces the columns.
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

  if not public.is_committee_leader_of_volunteer(old.id) then
    raise exception 'Only an admin or the committee leader can update this volunteer';
  end if;

  return new;
end $$;

create trigger volunteers_guard_update
  before update on public.volunteers
  for each row execute function public.guard_volunteers_update();

-- ============================================================
-- updated_at TOUCH
-- ============================================================
create trigger departments_touch before update on public.departments
  for each row execute function public.touch_updated_at();
create trigger volunteers_touch before update on public.volunteers
  for each row execute function public.touch_updated_at();

-- ============================================================
-- RLS ENABLE
-- ============================================================
alter table public.departments enable row level security;
alter table public.volunteers enable row level security;
alter table public.committee_members enable row level security;
alter table public.committee_leaders enable row level security;

-- ============================================================
-- POLICIES — DEPARTMENTS
-- ============================================================
create policy "departments_select" on public.departments
  for select to authenticated using (true);
create policy "departments_insert_super" on public.departments
  for insert to authenticated with check (public.is_super_admin());
create policy "departments_update_super" on public.departments
  for update to authenticated using (public.is_super_admin());
create policy "departments_delete_super" on public.departments
  for delete to authenticated using (public.is_super_admin());

-- ============================================================
-- POLICIES — VOLUNTEERS
-- ============================================================
create policy "volunteers_select" on public.volunteers
  for select to authenticated using (
    public.is_admin()
    or profile_id = auth.uid()
    or public.is_committee_leader_of_volunteer(id)
  );
create policy "volunteers_insert_admin" on public.volunteers
  for insert to authenticated with check (public.is_admin());
create policy "volunteers_update" on public.volunteers
  for update to authenticated
  using (public.is_admin() or public.is_committee_leader_of_volunteer(id))
  with check (public.is_admin() or public.is_committee_leader_of_volunteer(id));
create policy "volunteers_delete_super" on public.volunteers
  for delete to authenticated using (public.is_super_admin());

-- ============================================================
-- POLICIES — COMMITTEE MEMBERS
-- ============================================================
create policy "members_select" on public.committee_members
  for select to authenticated using (
    public.is_admin()
    or public.is_committee_leader(committee_id)
    or public.is_committee_member(volunteer_id)
  );
create policy "members_write_admin" on public.committee_members
  for insert to authenticated with check (public.is_admin());
create policy "members_update_admin" on public.committee_members
  for update to authenticated using (public.is_admin());
create policy "members_delete_admin" on public.committee_members
  for delete to authenticated using (public.is_admin());

-- ============================================================
-- POLICIES — COMMITTEE LEADERS
-- ============================================================
create policy "leaders_select" on public.committee_leaders
  for select to authenticated using (true);
create policy "leaders_write_super" on public.committee_leaders
  for insert to authenticated with check (public.is_super_admin());
create policy "leaders_update_super" on public.committee_leaders
  for update to authenticated using (public.is_super_admin());
create policy "leaders_delete_super" on public.committee_leaders
  for delete to authenticated using (public.is_super_admin());

-- ============================================================
-- VOLUNTEER DETAIL VIEW (security_invoker => base RLS applies)
-- ============================================================
create or replace view public.volunteer_details
with (security_invoker = true) as
select
  v.id,
  v.profile_id,
  v.full_name,
  v.search_name,
  v.phone,
  v.notes,
  v.status,
  v.created_at,
  v.updated_at,
  coalesce(
    (select jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'name_en', d.name_en)
       order by d.sort_order)
     from public.committee_members cm
     join public.departments d on d.id = cm.committee_id
     where cm.volunteer_id = v.id),
    '[]'::jsonb
  ) as committees,
  coalesce(
    (select jsonb_agg(jsonb_build_object('committee_id', cl.committee_id, 'is_deputy', cl.is_deputy))
     from public.committee_leaders cl
     where cl.leader_id = v.id),
    '[]'::jsonb
  ) as leadership
from public.volunteers v;

grant select on public.volunteer_details to authenticated;

-- ============================================================
-- AUDIT: extend the whitelist for the volunteers system.
-- (Base function: 0006/0009. Non-destructive additions only.)
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
    'committee_leader_set', 'committee_leader_removed'
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
  then
    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (v_uid, p_action, p_target_type, p_target_id, p_metadata);
  else
    raise exception 'Not authorized to write audit logs';
  end if;
end $$;