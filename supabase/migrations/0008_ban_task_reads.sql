-- ============================================================
-- RAS — P2 final hardening: block banned users from reading
-- task / task_assignment data at the database layer.
--
-- Root cause (from P2 final report):
--   Banned users could still SELECT tasks and task_assignments
--   because several task access paths never checked
--   profiles.status:
--     * tasks_select      -> is_team_leader(team_id) /
--                            is_team_member(team_id) branches
--     * tasks_select      -> created_by = auth.uid() branch
--     * tasks_select      -> is_assigned_task(id) branch
--     * assignments_select -> volunteer_id = auth.uid() branch
--     * assignments_select -> is_task_leader(task_id) branch
--
-- Fix:
--   Introduce is_active_user() (SECURITY DEFINER, search_path
--   pinned) and require it on every task/assignment SELECT path.
--   The existing helpers is_assigned_task() / is_task_leader()
--   now require an active caller as well.
--
--   Active-user behavior is preserved EXACTLY:
--     - active volunteer: own assignments + assigned tasks
--     - active team leader: own team's tasks/assignments
--     - general/super admin: everything
--     - anonymous: still blocked (policies are `to authenticated`
--       and helper EXECUTE is revoked from public/anon)
--   Banned users: every SELECT path now resolves to false.
--
-- Non-destructive: no DROP TABLE / TRUNCATE / DELETE of data;
-- only functions, policies and grants change.
-- ============================================================

-- ---------- ACTIVE-CALLER HELPER ----------

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

revoke execute on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

-- ---------- TASK HELPERS NOW REQUIRE AN ACTIVE CALLER ----------

create or replace function public.is_assigned_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public as $$
  select public.is_active_user()
    and exists (
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
    or (
      public.is_active_user()
      and exists (
        select 1
        from public.tasks t
        join public.team_leaders tl on tl.team_id = t.team_id
        where t.id = p_task_id
          and tl.leader_id = auth.uid()
      )
    );
$$;

-- ---------- TASKS SELECT: gate every branch on active status ----------

drop policy if exists "tasks_select" on public.tasks;
create policy "tasks_select" on public.tasks
  for select to authenticated using (
    public.is_admin()
    or (
      team_id is not null
      and public.is_active_user()
      and (public.is_team_leader(team_id) or public.is_team_member(team_id))
    )
    or (created_by = auth.uid() and public.is_active_user())
    or public.is_assigned_task(id)
  );

-- ---------- TASK ASSIGNMENTS SELECT: gate direct branch on active status ----------

drop policy if exists "assignments_select" on public.task_assignments;
create policy "assignments_select" on public.task_assignments
  for select to authenticated using (
    (volunteer_id = auth.uid() and public.is_active_user())
    or public.is_admin()
    or public.is_task_leader(task_id)
  );

-- Write policies (assignments_insert / assignments_update_leader /
-- assignments_delete / tasks_write / tasks_update / tasks_delete and
-- assignments_update_self) are intentionally unchanged: application
-- middleware already blocks banned users, and this migration only
-- closes the reported SELECT gap. is_admin()/is_task_leader() remain
-- the write-side guards exactly as before.
