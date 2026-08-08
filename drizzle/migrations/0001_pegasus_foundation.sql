-- PEGASUS defensive event and alert foundation.
-- This migration is intentionally not applied by the application at runtime.

create table if not exists pegasus_security_events (
  id bigserial primary key,
  owner_id bigint not null references osiris_operators(id),
  source text not null,
  category text not null check (category in ('authentication', 'configuration', 'integration', 'system')),
  signal text not null,
  severity text not null check (severity in ('info', 'low', 'medium', 'high', 'critical')),
  confidence integer not null check (confidence between 0 and 100),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  previous_event_hash text,
  event_hash text not null unique check (event_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists pegasus_events_owner_recorded_idx
  on pegasus_security_events (owner_id, recorded_at desc);

create table if not exists pegasus_alerts (
  id bigserial primary key,
  owner_id bigint not null references osiris_operators(id),
  event_id bigint not null references pegasus_security_events(id),
  rule_id text not null,
  title text not null,
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  requires_approval boolean not null default true,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'dismissed', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists pegasus_alerts_owner_status_idx
  on pegasus_alerts (owner_id, status, created_at desc);

alter table pegasus_security_events enable row level security;
alter table pegasus_alerts enable row level security;

comment on table pegasus_security_events is
  'Append-only defensive observations. An event is not proof of a threat.';
comment on table pegasus_alerts is
  'Approval-gated PEGASUS findings; no autonomous response actions.';
