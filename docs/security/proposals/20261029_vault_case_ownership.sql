-- PROPOSED migration. Tested only in disposable PostgreSQL fixtures.
-- Not applied, not in the automatic migration manifest. Separate owner approval
-- and a PostgreSQL 17 / Supabase staging rehearsal are required before use.
-- Run this entire transaction once; never remove conflicting evidence to pass it.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Composite foreign keys also bind trusted-server/BYPASSRLS writes. Validation
-- fails atomically if existing records do not agree with their case owner.
alter table public.security_cases
  add constraint security_cases_id_owner_key unique (id, owner_id);
alter table public.evidence_records
  add constraint evidence_records_case_owner_fkey
  foreign key (case_id, owner_id) references public.security_cases (id, owner_id)
  not valid;
alter table public.case_audit_events
  add constraint case_audit_events_case_operator_fkey
  foreign key (case_id, operator_id) references public.security_cases (id, owner_id)
  not valid;
alter table public.evidence_records
  validate constraint evidence_records_case_owner_fkey;
alter table public.case_audit_events
  validate constraint case_audit_events_case_operator_fkey;

-- Preserve authenticated SELECT for ownership policy resolution. Current
-- application provisioning/profile sync uses the trusted server connection.
revoke insert, update, delete on public.osiris_operators from anon, authenticated;
revoke all on public.osiris_operators, public.security_cases,
  public.evidence_records, public.case_audit_events from anon;
-- These grants advertise writes the append-only triggers already reject.
revoke update, delete on public.evidence_records, public.case_audit_events
  from authenticated;

-- Check both row attribution and case ownership, for reads as well as writes.
alter policy evidence_records_select_own on public.evidence_records
  using (
    exists (
      select 1 from public.security_cases c
      join public.osiris_operators o on o.id = c.owner_id
      where c.id = evidence_records.case_id
        and c.owner_id = evidence_records.owner_id
        and o.auth_user_id = (select auth.uid())
    )
  );
alter policy evidence_records_insert_own on public.evidence_records
  with check (
    exists (
      select 1 from public.security_cases c
      join public.osiris_operators o on o.id = c.owner_id
      where c.id = evidence_records.case_id
        and c.owner_id = evidence_records.owner_id
        and o.auth_user_id = (select auth.uid())
    )
  );
alter policy case_audit_events_select_own on public.case_audit_events
  using (
    exists (
      select 1 from public.security_cases c
      join public.osiris_operators o on o.id = c.owner_id
      where c.id = case_audit_events.case_id
        and c.owner_id = case_audit_events.operator_id
        and o.auth_user_id = (select auth.uid())
    )
  );
alter policy case_audit_events_insert_own on public.case_audit_events
  with check (
    exists (
      select 1 from public.security_cases c
      join public.osiris_operators o on o.id = c.owner_id
      where c.id = case_audit_events.case_id
        and c.owner_id = case_audit_events.operator_id
        and o.auth_user_id = (select auth.uid())
    )
  );
commit;
