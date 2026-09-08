-- ============================================================
-- 0016 Fix attendance/evaluation policy column-shadowing bug
--
-- In 0015 the RLS member-check subqueries used unqualified
-- `committee_id`/`volunteer_id`, which PostgreSQL resolved to the
-- subquery's OWN tables, never matching the new/updated row. This
-- made every leader write to convoy_attendance / convoy_evaluations
-- fail RLS. Recreating the four policies with fully-qualified
-- references to the policy table columns.
-- ============================================================

drop policy if exists "attendance_write" on public.convoy_attendance;
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

drop policy if exists "attendance_update" on public.convoy_attendance;
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

drop policy if exists "evaluations_write" on public.convoy_evaluations;
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

drop policy if exists "evaluations_update" on public.convoy_evaluations;
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