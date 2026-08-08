-- Pin PEGASUS trigger-function name resolution to prevent objects in an
-- attacker-controlled schema from shadowing trusted relations.

create or replace function public.pegasus_reject_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'PEGASUS security events are append-only';
end;
$$;

create or replace function public.pegasus_advance_chain_head()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_head public.pegasus_chain_heads%rowtype;
begin
  select * into current_head
  from public.pegasus_chain_heads
  where owner_id = new.owner_id
  for update;

  if found and new.previous_event_hash is distinct from current_head.last_event_hash then
    raise exception 'PEGASUS event does not extend the current chain head';
  end if;
  if not found and new.previous_event_hash is not null then
    raise exception 'First PEGASUS event must have no previous hash';
  end if;

  insert into public.pegasus_chain_heads (owner_id, event_count, last_event_hash)
  values (new.owner_id, 1, new.event_hash)
  on conflict (owner_id) do update set
    event_count = public.pegasus_chain_heads.event_count + 1,
    last_event_hash = excluded.last_event_hash,
    updated_at = now();
  return new;
end;
$$;
