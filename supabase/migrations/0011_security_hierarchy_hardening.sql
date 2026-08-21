-- ============================================================
-- RAS — P1 security hierarchy hardening (3 HIGH findings)
--
-- 1) profiles UPDATE: a general admin must not change the status
--    of a super_admin account (role hierarchy). The existing
--    guard_profiles_update() only required is_admin(); the DB
--    must refuse super_admin status changes unless the actor is
--    a super admin. Trusted non-session contexts (service-role
--    key, SQL editor / postgres) have auth.uid() = null and stay
--    exempt, preserving bootstrap and service-role management.
--
-- 2) task_assignments INSERT: a team leader may only assign
--    ACTIVE members of their OWN team. Previously a leader could
--    insert an assignment for any user id — a member of another
--    team or even a banned profile. Admins retain global
--    assignment, but no one may assign a banned/inactive
--    volunteer. Enforced with a BEFORE INSERT trigger (SECURITY
--    DEFINER, search_path pinned) so it reuses the existing
--    helper architecture and never reintroduces the 0007 RLS
--    recursion. The existing assignments_insert policy
--    (is_admin() or is_task_leader(task_id)) is unchanged: it
--    gates who may insert at all; the trigger adds target
--    validity.
--
-- 3) team_leaders DELETE: a plain team leader must not remove an
--    admin (general/super) co-leader, and nobody may self-remove
--    as the last remaining leader of a team (a team must keep at
--    least one leader). Admins retain global leader management.
--    The check_leader_single_team() trigger ("a volunteer cannot
--    lead more than one team") is untouched. Enforced with a
--    BEFORE DELETE trigger — a trigger, not a policy, avoids the
--    profiles <-> team_leaders RLS recursion risk.
--
-- Non-destructive: no DROP TABLE / TRUNCATE / DELETE of data;
-- only functions and triggers change.
-- ============================================================

-- ---------- 1) ROLE HIERARCHY ON PROFILES STATUS CHANGE ----------

create or replace function public.guard_profiles_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Trusted contexts with no JWT session (service-role, SQL editor, postgres).
  if auth.uid() is null then
    return new;
  end if;

  if old.id is distinct from new.id then
    raise exception 'Profile id cannot be changed';
  end if;

  if (old.role is distinct from new.role) and not public.is_super_admin() then
    raise exception 'Only a super admin can change a user role';
  end if;

  -- A general admin must never change the status of a super admin.
  if (old.status is distinct from new.status)
     and not public.is_super_admin()
     and (old.role = 'super_admin' or new.role = 'super_admin') then
    raise exception 'Only a super admin can change a super admin status';
  end if;

  if (old.status is distinct from new.status) and not public.is_admin() then
    raise exception 'Only an admin can change account status';
  end if;

  return new;
end $$;

-- ---------- 2) TASK ASSIGNMENT TARGET VALIDATION ----------

create or replace function public.guard_task_assignment_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_task_team uuid;
  v_target_active boolean;
begin
  -- Trusted contexts (service-role, SQL editor, postgres) are exempt.
  if auth.uid() is null then
    return new;
  end if;

  select team_id into v_task_team from public.tasks where id = new.task_id;

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

  -- Non-admin actors must lead the task's team.
  if v_task_team is null or not public.is_team_leader(v_task_team) then
    raise exception 'Only a leader of the task team can assign it';
  end if;

  -- And the target must be a member of that team.
  if not exists (
    select 1 from public.team_members
    where team_id = v_task_team and volunteer_id = new.volunteer_id
  ) then
    raise exception 'Assignment target is not a member of the task team';
  end if;

  return new;
end $$;

create trigger assignments_insert_guard
  before insert on public.task_assignments
  for each row execute function public.guard_task_assignment_insert();

-- ---------- 3) TEAM LEADER REMOVAL HIERARCHY + LAST-LEADER GUARD ----------

create or replace function public.guard_team_leader_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Trusted contexts (service-role, SQL editor, postgres) are exempt.
  if auth.uid() is null then
    return old;
  end if;

  -- A plain team leader must not remove an admin (general/super) co-leader.
  if not public.is_admin() then
    if exists (
      select 1 from public.profiles p
      where p.id = old.leader_id and p.role in ('general_admin', 'super_admin')
    ) then
      raise exception 'A team leader cannot remove an admin';
    end if;
  end if;

  -- Nobody may remove themselves as the last remaining leader of a team.
  if old.leader_id = auth.uid() then
    if not exists (
      select 1 from public.team_leaders tl
      where tl.team_id = old.team_id and tl.leader_id <> old.leader_id
    ) then
      raise exception 'A team must keep at least one leader';
    end if;
  end if;

  return old;
end $$;

create trigger leaders_delete_guard
  before delete on public.team_leaders
  for each row execute function public.guard_team_leader_delete();
