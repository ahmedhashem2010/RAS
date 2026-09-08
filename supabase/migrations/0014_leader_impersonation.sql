-- ============================================================
-- 0014 Leader impersonation
--
-- Adds `leader_impersonation_started` / `leader_impersonation_ended`
-- to the log_audit action whitelist. Impersonation is reserved for
-- super admins (covered by the existing is_admin() branch).
-- (Base function: 0006/0009/0013. Non-destructive additions only.)
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
    'leader_impersonation_started', 'leader_impersonation_ended'
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
  then
    insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
    values (v_uid, p_action, p_target_type, p_target_id, p_metadata);
  else
    raise exception 'Not authorized to write audit logs';
  end if;
end $$;