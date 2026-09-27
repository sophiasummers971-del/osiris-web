-- Recovered read-only from migration 20260803154721 (qualify_audit_digest_function).
-- This historical migration assumes the original Vault tables already exist.
create or replace function public.seal_audit_event()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  perform pg_advisory_xact_lock(new.case_id);

  select event_hash
    into new.previous_event_hash
  from public.case_audit_events
  where case_id = new.case_id
  order by id desc
  limit 1;

  new.event_hash := encode(
    extensions.digest(
      concat_ws(
        '|',
        new.case_id::text,
        new.operator_id::text,
        new.action,
        new.details::text,
        coalesce(new.previous_event_hash, ''),
        new.created_at::text
      ),
      'sha256'
    ),
    'hex'
  );

  return new;
end;
$function$;
