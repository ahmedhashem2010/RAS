-- ============================================================
-- RAS — team leaderboard view (public aggregate, no private data)
-- ============================================================

create or replace view public.team_leaderboard as
select
  tm.team_id,
  tm.volunteer_id,
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
  tm.joined_at
from public.team_members tm
join public.profiles p on p.id = tm.volunteer_id
left join public.volunteer_scores s on s.volunteer_id = tm.volunteer_id;

grant select on public.team_leaderboard to authenticated;
