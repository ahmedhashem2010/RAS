-- ============================================================
-- RAS — harden profiles UPDATE against privilege escalation
--
-- RLS policies cannot restrict which COLUMNS may be updated, so
-- the existing "profiles_update" policy allowed any authenticated
-- user to update their own row including role/status.
--
-- This adds a BEFORE UPDATE trigger that blocks changes to
-- privilege-sensitive columns unless the actor holds the required
-- admin permission (enforced in the database, not the client):
--   - id      : immutable for everyone
--   - role    : only a super_admin may change it
--   - status  : only an admin (general_admin | super_admin) may change it
--
-- Trusted non-session contexts (service-role key, SQL editor /
-- postgres superuser) have auth.uid() = null and are exempt, which
-- preserves bootstrap and service-role user management.
-- ============================================================

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

  if (old.status is distinct from new.status) and not public.is_admin() then
    raise exception 'Only an admin can change account status';
  end if;

  return new;
end $$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profiles_update();
