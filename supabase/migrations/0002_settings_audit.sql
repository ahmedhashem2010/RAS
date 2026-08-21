-- ============================================================
-- RAS — settings + audit helper
-- ============================================================

create table if not exists public.app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

alter table public.app_settings enable row level security;

create policy "settings_select_admin" on public.app_settings
  for select to authenticated using (public.is_admin());
create policy "settings_write_admin" on public.app_settings
  for insert to authenticated with check (public.is_admin());
create policy "settings_update_admin" on public.app_settings
  for update to authenticated using (public.is_admin());

grant select, insert, update on public.app_settings to authenticated;

-- Audit helper callable by any authenticated user; records actor automatically.
create or replace function public.log_audit(
  p_action text,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), p_action, p_target_type, p_target_id, p_metadata);
end $$;

grant execute on function public.log_audit(text, text, text, jsonb) to authenticated;
