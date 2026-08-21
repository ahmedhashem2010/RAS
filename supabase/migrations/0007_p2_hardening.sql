-- ============================================================
-- RAS — P2 functional & hardening follow-up
--
-- 1) Fix the tasks / task_assignments RLS infinite recursion
--    (42P17). The policies referenced each other with inline
--    EXISTS subqueries (tasks_select -> task_assignments and
--    assignments_* -> tasks), and PostgREST/PostgreSQL evaluates
--    those sublinks even when another OR branch already matches,
--    so every task-related query failed for every role.
--    Fix: SECURITY DEFINER helpers (search_path pinned) that run
--    as the table owner and therefore never re-enter the RLS
--    policies of the referenced tables. Original permissions are
--    preserved exactly: admins manage everything, team leaders
--    manage their own team's tasks/assignments, volunteers see
--    only their own assignments and tasks they belong to.
--
-- 2) Harden SECURITY DEFINER RPC EXECUTE privileges. The previous
--    migration only did `revoke ... from anon`, but functions
--    default to PUBLIC EXECUTE, so PUBLIC (and therefore anon)
--    kept the right to invoke them. This revokes PUBLIC + anon
--    and re-states the authenticated grants (the app role), so
--    anonymous clients can no longer invoke them at all while the
--    internal authorization guards remain as defense in depth.
--
-- Safe & non-destructive: no DROP TABLE / TRUNCATE / DELETE of
-- existing data. Only policies, functions and grants change.
-- ============================================================

-- ---------- 1) TASK RLS RECURSION HELPERS ----------

create or replace function public.is_assigned_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select exists (
    select 1 from public.task_assignments ta
    where ta.task_id = p_task_id
      and ta.volunteer_id = auth.uid()
  );
$$;

create or replace function public.is_task_leader(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select public.is_admin()
    or exists (
      select 1
      from public.tasks t
      join public.team_leaders tl on tl.team_id = t.team_id
      where t.id = p_task_id
        and tl.leader_id = auth.uid()
    );
$$;

-- Helpers are internal to policy evaluation / the app only.
revoke execute on function public.is_assigned_task(uuid) from public, anon;
revoke execute on function public.is_task_leader(uuid) from public, anon;
grant execute on function public.is_assigned_task(uuid) to authenticated;
grant execute on function public.is_task_leader(uuid) to authenticated;

-- ---------- TASKS POLICIES (no inline task_assignments subquery) ----------

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select to authenticated using (
    public.is_admin()
    or (team_id is not null and (public.is_team_leader(team_id) or public.is_team_member(team_id)))
    or created_by = auth.uid()
    or public.is_assigned_task(id)
  );

-- tasks_write / tasks_update / tasks_delete are unchanged: they only
-- reference the SECURITY DEFINER helpers is_admin()/is_team_leader().

-- ---------- TASK ASSIGNMENTS POLICIES (no inline tasks subquery) ----------

drop policy if exists "assignments_select" on public.task_assignments;
create policy "assignments_select" on public.task_assignments
  for select to authenticated using (
    volunteer_id = auth.uid() or public.is_admin() or public.is_task_leader(task_id)
  );

drop policy if exists "assignments_insert" on public.task_assignments;
create policy "assignments_insert" on public.task_assignments
  for insert to authenticated with check (
    public.is_admin() or public.is_task_leader(task_id)
  );

-- assignments_update_self (volunteer_id = auth.uid()) contains no
-- subquery and is left as-is.

drop policy if exists "assignments_update_leader" on public.task_assignments;
create policy "assignments_update_leader" on public.task_assignments
  for update to authenticated using (
    public.is_admin() or public.is_task_leader(task_id)
  );

drop policy if exists "assignments_delete" on public.task_assignments;
create policy "assignments_delete" on public.task_assignments
  for delete to authenticated using (
    public.is_admin() or public.is_task_leader(task_id)
  );

-- ---------- 2) SECURITY DEFINER RPC EXECUTE HARDENING ----------

-- PUBLIC inherited EXECUTE by default; revoke PUBLIC and anon so
-- anonymous clients cannot invoke these functions at all. The app
-- (authenticated) keeps its grants and remains fully unaffected.

revoke execute on function public.get_team_leaderboard(uuid) from public, anon;
revoke execute on function public.get_leaderboard() from public, anon;
revoke execute on function public.get_score(uuid) from public, anon;
revoke execute on function public.get_all_scores() from public, anon;
revoke execute on function public.get_profiles(uuid[]) from public, anon;
revoke execute on function public.get_active_profiles() from public, anon;
revoke execute on function public.get_management_profiles() from public, anon;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon;

-- Restate the authenticated grants explicitly (application role).
grant execute on function public.get_team_leaderboard(uuid) to authenticated;
grant execute on function public.get_leaderboard() to authenticated;
grant execute on function public.get_score(uuid) to authenticated;
grant execute on function public.get_all_scores() to authenticated;
grant execute on function public.get_profiles(uuid[]) to authenticated;
grant execute on function public.get_active_profiles() to authenticated;
grant execute on function public.get_management_profiles() to authenticated;
grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;
