-- Harden PEGASUS events as an append-only ledger and retain an independent
-- database-maintained chain head so deleting the newest records is detectable.

create table if not exists pegasus_chain_heads (
  owner_id bigint primary key references osiris_operators(id),
  event_count bigint not null check (event_count > 0),
  last_event_hash text not null check (last_event_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

insert into pegasus_chain_heads (owner_id, event_count, last_event_hash)
select owner_id, count(*), (array_agg(event_hash order by id desc))[1]
from pegasus_security_events
group by owner_id
on conflict (owner_id) do update set
  event_count = excluded.event_count,
  last_event_hash = excluded.last_event_hash,
  updated_at = now();

create or replace function pegasus_reject_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'PEGASUS security events are append-only';
end;
$$;

drop trigger if exists pegasus_events_reject_mutation on pegasus_security_events;
create trigger pegasus_events_reject_mutation
before update or delete on pegasus_security_events
for each row execute function pegasus_reject_event_mutation();

drop trigger if exists pegasus_events_reject_truncate on pegasus_security_events;
create trigger pegasus_events_reject_truncate
before truncate on pegasus_security_events
execute function pegasus_reject_event_mutation();

create or replace function pegasus_advance_chain_head()
returns trigger
language plpgsql
as $$
declare
  current_head pegasus_chain_heads%rowtype;
begin
  select * into current_head
  from pegasus_chain_heads
  where owner_id = new.owner_id
  for update;

  if found and new.previous_event_hash is distinct from current_head.last_event_hash then
    raise exception 'PEGASUS event does not extend the current chain head';
  end if;
  if not found and new.previous_event_hash is not null then
    raise exception 'First PEGASUS event must have no previous hash';
  end if;

  insert into pegasus_chain_heads (owner_id, event_count, last_event_hash)
  values (new.owner_id, 1, new.event_hash)
  on conflict (owner_id) do update set
    event_count = pegasus_chain_heads.event_count + 1,
    last_event_hash = excluded.last_event_hash,
    updated_at = now();
  return new;
end;
$$;

drop trigger if exists pegasus_events_advance_chain_head on pegasus_security_events;
create trigger pegasus_events_advance_chain_head
after insert on pegasus_security_events
for each row execute function pegasus_advance_chain_head();

alter table pegasus_chain_heads enable row level security;

comment on table pegasus_chain_heads is
  'Database-maintained PEGASUS ledger checkpoint used to detect tail truncation.';
