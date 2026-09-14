-- Align Supabase RLS and indexes with the OSIRIS owner model.
-- The canonical Postgres names are owner_id, case_id, and operator_id.

create index if not exists case_audit_events_operator_idx
  on public.case_audit_events (operator_id);
create index if not exists evidence_records_owner_idx
  on public.evidence_records (owner_id);
create index if not exists pegasus_alerts_event_idx
  on public.pegasus_alerts (event_id);

-- auth.uid() is wrapped in a scalar subquery so Postgres evaluates it once.
drop policy if exists osiris_operators_select_own on public.osiris_operators;
create policy osiris_operators_select_own on public.osiris_operators
  for select to authenticated
  using (auth_user_id = (select auth.uid()));
drop policy if exists osiris_operators_insert_own on public.osiris_operators;
create policy osiris_operators_insert_own on public.osiris_operators
  for insert to authenticated
  with check (auth_user_id = (select auth.uid()));
drop policy if exists osiris_operators_update_own on public.osiris_operators;
create policy osiris_operators_update_own on public.osiris_operators
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));
drop policy if exists osiris_operators_delete_own on public.osiris_operators;
create policy osiris_operators_delete_own on public.osiris_operators
  for delete to authenticated
  using (auth_user_id = (select auth.uid()));

drop policy if exists security_cases_select_own on public.security_cases;
create policy security_cases_select_own on public.security_cases
  for select to authenticated
  using (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
drop policy if exists security_cases_insert_own on public.security_cases;
create policy security_cases_insert_own on public.security_cases
  for insert to authenticated
  with check (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
drop policy if exists security_cases_update_own on public.security_cases;
create policy security_cases_update_own on public.security_cases
  for update to authenticated
  using (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ))
  with check (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
drop policy if exists security_cases_delete_own on public.security_cases;
create policy security_cases_delete_own on public.security_cases
  for delete to authenticated
  using (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));

drop policy if exists evidence_records_select_own on public.evidence_records;
create policy evidence_records_select_own on public.evidence_records
  for select to authenticated
  using (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
drop policy if exists evidence_records_insert_own on public.evidence_records;
create policy evidence_records_insert_own on public.evidence_records
  for insert to authenticated
  with check (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
-- Evidence is append-only; do not advertise update/delete capabilities.
drop policy if exists evidence_records_update_own on public.evidence_records;
drop policy if exists evidence_records_delete_own on public.evidence_records;

drop policy if exists case_audit_events_select_own on public.case_audit_events;
create policy case_audit_events_select_own on public.case_audit_events
  for select to authenticated
  using (operator_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
drop policy if exists case_audit_events_insert_own on public.case_audit_events;
create policy case_audit_events_insert_own on public.case_audit_events
  for insert to authenticated
  with check (operator_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
-- Audit events are append-only; do not advertise update/delete capabilities.
drop policy if exists case_audit_events_update_own on public.case_audit_events;
drop policy if exists case_audit_events_delete_own on public.case_audit_events;

create policy pegasus_security_events_select_own
  on public.pegasus_security_events for select to authenticated
  using (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
create policy pegasus_security_events_insert_own
  on public.pegasus_security_events for insert to authenticated
  with check (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));

create policy pegasus_alerts_select_own
  on public.pegasus_alerts for select to authenticated
  using (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
create policy pegasus_alerts_insert_own
  on public.pegasus_alerts for insert to authenticated
  with check (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));
create policy pegasus_alerts_update_own
  on public.pegasus_alerts for update to authenticated
  using (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ))
  with check (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));

-- Chain heads are maintained by the database trigger and are read-only to users.
create policy pegasus_chain_heads_select_own
  on public.pegasus_chain_heads for select to authenticated
  using (owner_id in (
    select id from public.osiris_operators
    where auth_user_id = (select auth.uid())
  ));

-- This administrative event-trigger helper must never be exposed via RPC.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
