create table public.pegasus_email_config (
  owner_id bigint primary key references public.osiris_operators(id),
  singleton boolean not null default true unique check (singleton),
  enabled boolean not null default false,
  start_after_alert_id bigint not null default 0,
  enabled_at timestamptz
);
create unique index pegasus_alerts_email_owner_idx on public.pegasus_alerts(id,owner_id);
create table public.pegasus_email_outbox (
  alert_id bigint primary key,
  owner_id bigint not null references public.pegasus_email_config(owner_id),
  status text not null default 'pending'
    check (status in ('pending','sending','retry','accepted','failed')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  accepted_at timestamptz,
  last_error text check (last_error is null or last_error in ('EMAIL_SEND_FAILED','EMAIL_ACCEPTANCE_UNKNOWN')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (alert_id,owner_id) references public.pegasus_alerts(id,owner_id),
  check ((status='sending') = (lease_token is not null and lease_until is not null)),
  check (status<>'accepted' or accepted_at is not null)
);
create index pegasus_email_outbox_due_idx on public.pegasus_email_outbox(next_attempt_at,alert_id)
  where status in ('pending','retry','sending');
create index pegasus_email_outbox_owner_idx on public.pegasus_email_outbox(owner_id,alert_id desc);
alter table public.pegasus_email_config enable row level security;
alter table public.pegasus_email_outbox enable row level security;
revoke all on public.pegasus_email_config,public.pegasus_email_outbox from public,anon,authenticated;
grant select,insert,update on public.pegasus_email_config,public.pegasus_email_outbox to service_role;
insert into public.pegasus_email_config(owner_id)
select o.id from public.osiris_operators o join auth.users u on u.id=o.auth_user_id
where lower(u.email)='sophiasummers971@gmail.com' and u.email_confirmed_at is not null;
do $$
begin
  if (select count(*) from public.pegasus_email_config)<>1 then
    raise exception 'Expected one verified email-alarm owner';
  end if;
end
$$;
