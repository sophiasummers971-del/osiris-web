-- Pending: do not apply until Google connector review and account setup.
-- No table or row is removed; existing GitHub connections remain unchanged.
begin;
alter table public.monitoring_connections
  drop constraint monitoring_connections_provider_check;
alter table public.monitoring_connections
  add constraint monitoring_connections_provider_check
  check (provider in ('github', 'google'));
commit;
