-- ============================================================
-- 0017 Expose rating/description through volunteer_details
--
-- 0015 added standing assessment columns to volunteers; this
-- appends them to the security_invoker view so the roster UI
-- (volunteer_details) can render/edit them.
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
  ) as leadership,
  v.rating,
  v.description
from public.volunteers v;

grant select on public.volunteer_details to authenticated;