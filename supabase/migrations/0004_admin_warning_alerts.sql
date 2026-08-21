-- ============================================================
-- RAS — notify admins when a volunteer reaches the warning limit
-- (idempotent upgrade; replaces public.notify_warned from 0001)
-- ============================================================

create or replace function public.notify_warned()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit int;
begin
  select (value #>> '{}')::int into v_limit
  from public.app_settings where key = 'warning_limit';
  if v_limit is null then v_limit := 3; end if;

  perform public.push_notification(
    new.volunteer_id, 'warning', 'إنذار',
    'تم تسجيل إنذار رقم ' || new.number || ' ضدك'
  );

  if new.number >= v_limit then
    insert into public.notifications (user_id, type, title, body, data)
    select p.id, 'warning_alert', 'إنذار يلزم مراجعة الإدارة',
           'وصل متطوع إلى ' || new.number || ' إنذارات — راجع الحالة واتخذ القرار',
           jsonb_build_object('volunteer_id', new.volunteer_id, 'warning_number', new.number)
    from public.profiles p
    where p.status = 'active' and p.role in ('general_admin', 'super_admin');
  end if;

  return new;
end $$;
