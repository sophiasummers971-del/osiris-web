-- Durable, server-managed foundation for account monitoring.
-- OAuth secrets are ciphertext and these tables intentionally have no
-- authenticated PostgREST policies: access goes through the OSIRIS Worker.

alter table public.pegasus_security_events
  add column if not exists source_event_key text;
create unique index if not exists pegasus_events_owner_source_key_idx
  on public.pegasus_security_events (owner_id, source_event_key)
  where source_event_key is not null;

create table if not exists public.monitoring_connections (
  id bigserial primary key,
  owner_id bigint not null references public.osiris_operators(id) on delete cascade,
  provider text not null check (provider in ('github')),
  provider_account_id text not null,
  display_name text,
  status text not null default 'active'
    check (status in ('active', 'reauthorization_required', 'disconnected')),
  scopes text[] not null default '{}',
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  checkpoint jsonb not null default '{}'::jsonb,
  last_checked_at timestamptz,
  next_check_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monitoring_connections_provider_account_unique
    unique (owner_id, provider, provider_account_id)
);

create index if not exists monitoring_connections_due_idx
  on public.monitoring_connections (status, next_check_at);

create table if not exists public.monitoring_runs (
  id uuid primary key default gen_random_uuid(),
  connection_id bigint not null references public.monitoring_connections(id) on delete cascade,
  owner_id bigint not null references public.osiris_operators(id) on delete cascade,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  checkpoint_before jsonb not null default '{}'::jsonb,
  checkpoint_after jsonb not null default '{}'::jsonb,
  observation_count integer not null default 0 check (observation_count >= 0),
  error_code text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists monitoring_runs_connection_started_idx
  on public.monitoring_runs (connection_id, started_at desc);

create table if not exists public.monitoring_observations (
  id bigserial primary key,
  connection_id bigint not null references public.monitoring_connections(id) on delete cascade,
  owner_id bigint not null references public.osiris_operators(id) on delete cascade,
  run_id uuid not null references public.monitoring_runs(id) on delete cascade,
  external_id text not null,
  kind text not null,
  observed_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  pegasus_event_id bigint references public.pegasus_security_events(id),
  created_at timestamptz not null default now(),
  constraint monitoring_observations_external_unique
    unique (connection_id, external_id)
);

create index if not exists monitoring_observations_unrecorded_idx
  on public.monitoring_observations (owner_id, id)
  where pegasus_event_id is null;

alter table public.monitoring_connections enable row level security;
alter table public.monitoring_runs enable row level security;
alter table public.monitoring_observations enable row level security;

revoke all on table public.monitoring_connections from anon, authenticated;
revoke all on table public.monitoring_runs from anon, authenticated;
revoke all on table public.monitoring_observations from anon, authenticated;

comment on column public.monitoring_connections.encrypted_access_token is
  'Versioned AES-GCM ciphertext; plaintext tokens must never be persisted.';
comment on table public.monitoring_observations is
  'Deduplicated provider facts staged before append-only PEGASUS recording.';
