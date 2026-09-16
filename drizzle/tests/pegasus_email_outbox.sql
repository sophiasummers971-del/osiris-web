begin;
do $test$
declare owner bigint; event bigint; high_alert bigint; low_alert bigint; foreign_owner bigint; n integer;
begin
  select owner_id into strict owner from public.pegasus_email_config;
  select id into strict event from public.pegasus_security_events where owner_id=owner order by id limit 1;
  update public.pegasus_email_config set enabled=true,
    start_after_alert_id=(select coalesce(max(id),0) from public.pegasus_alerts);
  insert into public.osiris_operators(external_id) values ('email-outbox-rehearsal-'||gen_random_uuid()) returning id into foreign_owner;
  insert into public.pegasus_alerts(owner_id,event_id,rule_id,title,severity)
    values(owner,event,'TEST-ROLLBACK','Rollback-only high alert','high') returning id into high_alert;
  insert into public.pegasus_alerts(owner_id,event_id,rule_id,title,severity)
    values(owner,event,'TEST-ROLLBACK','Rollback-only low alert','low') returning id into low_alert;
  insert into public.pegasus_alerts(owner_id,event_id,rule_id,title,severity)
    values(owner,event,'TEST-ROLLBACK','Rollback-only critical alert','critical');
  insert into public.pegasus_alerts(owner_id,event_id,rule_id,title,severity)
    values(foreign_owner,event,'TEST-ROLLBACK','Rollback-only foreign alert','critical');
  execute $enqueue$
  insert into public.pegasus_email_outbox (alert_id, owner_id)
  select a.id, a.owner_id from public.pegasus_alerts a
  join public.pegasus_email_config c on c.owner_id=a.owner_id
  where c.enabled and a.id>c.start_after_alert_id
    and a.severity in ('high','critical')
  on conflict (alert_id) do nothing
$enqueue$;
  get diagnostics n=row_count;
  if n<>2 then raise exception 'Severity/owner filtering failed: %',n; end if;
  execute $enqueue$
  insert into public.pegasus_email_outbox (alert_id, owner_id)
  select a.id, a.owner_id from public.pegasus_alerts a
  join public.pegasus_email_config c on c.owner_id=a.owner_id
  where c.enabled and a.id>c.start_after_alert_id
    and a.severity in ('high','critical')
  on conflict (alert_id) do nothing
$enqueue$;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Deduplication failed'; end if;
  execute $claim$
  with due as (
    select q.alert_id from public.pegasus_email_outbox q
    join public.pegasus_email_config c on c.owner_id=q.owner_id
    where c.enabled and q.attempts<5 and (
      (q.status in ('pending','retry') and q.next_attempt_at<=now())
      or (q.status='sending' and q.lease_until<=now())
    ) order by q.next_attempt_at,q.alert_id
    for update of q skip locked limit 10
  )
  update public.pegasus_email_outbox q
  set status='sending', attempts=q.attempts+1, lease_token='00000000-0000-4000-8000-000000000001'::uuid,
    lease_until=now()+interval '30 minutes', updated_at=now()
  from due where q.alert_id=due.alert_id
  returning q.alert_id,q.lease_token,q.attempts
$claim$;
  get diagnostics n=row_count;
  if n<>2 then raise exception 'Claim failed: %',n; end if;
  execute $claim$
  with due as (
    select q.alert_id from public.pegasus_email_outbox q
    join public.pegasus_email_config c on c.owner_id=q.owner_id
    where c.enabled and q.attempts<5 and (
      (q.status in ('pending','retry') and q.next_attempt_at<=now())
      or (q.status='sending' and q.lease_until<=now())
    ) order by q.next_attempt_at,q.alert_id
    for update of q skip locked limit 10
  )
  update public.pegasus_email_outbox q
  set status='sending', attempts=q.attempts+1, lease_token='00000000-0000-4000-8000-000000000001'::uuid,
    lease_until=now()+interval '30 minutes', updated_at=now()
  from due where q.alert_id=due.alert_id
  returning q.alert_id,q.lease_token,q.attempts
$claim$;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Active lease duplicate claim'; end if;
  execute replace($finish$
  update public.pegasus_email_outbox
  set status='accepted', next_attempt_at='2026-09-16T00:00:00.000Z'::timestamptz,
    accepted_at=case when 'accepted'='accepted' then now() else accepted_at end,
    last_error=case when 'accepted'='accepted' then null else 'EMAIL_SEND_FAILED' end,
    lease_token=null,lease_until=null,updated_at=now()
  where alert_id=171717172 and status='sending'
    and lease_token='00000000-0000-4000-8000-000000000002'::uuid
  returning alert_id
$finish$,'alert_id=171717172','alert_id='||high_alert);
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Stale lease completion accepted'; end if;
  execute replace($finish$
  update public.pegasus_email_outbox
  set status='accepted', next_attempt_at='2026-09-16T00:00:00.000Z'::timestamptz,
    accepted_at=case when 'accepted'='accepted' then now() else accepted_at end,
    last_error=case when 'accepted'='accepted' then null else 'EMAIL_SEND_FAILED' end,
    lease_token=null,lease_until=null,updated_at=now()
  where alert_id=171717172 and status='sending'
    and lease_token='00000000-0000-4000-8000-000000000001'::uuid
  returning alert_id
$finish$,'alert_id=171717172','alert_id='||high_alert);
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Acceptance persistence failed'; end if;
  update public.pegasus_email_outbox set status='retry',next_attempt_at=now()+interval '15 minutes',
    lease_token=null,lease_until=null where status='sending';
  execute $claim$
  with due as (
    select q.alert_id from public.pegasus_email_outbox q
    join public.pegasus_email_config c on c.owner_id=q.owner_id
    where c.enabled and q.attempts<5 and (
      (q.status in ('pending','retry') and q.next_attempt_at<=now())
      or (q.status='sending' and q.lease_until<=now())
    ) order by q.next_attempt_at,q.alert_id
    for update of q skip locked limit 10
  )
  update public.pegasus_email_outbox q
  set status='sending', attempts=q.attempts+1, lease_token='00000000-0000-4000-8000-000000000001'::uuid,
    lease_until=now()+interval '30 minutes', updated_at=now()
  from due where q.alert_id=due.alert_id
  returning q.alert_id,q.lease_token,q.attempts
$claim$;
  get diagnostics n=row_count;
  if n<>0 then raise exception 'Early retry'; end if;
  update public.pegasus_email_outbox set next_attempt_at=now()-interval '1 second' where status='retry';
  execute $claim$
  with due as (
    select q.alert_id from public.pegasus_email_outbox q
    join public.pegasus_email_config c on c.owner_id=q.owner_id
    where c.enabled and q.attempts<5 and (
      (q.status in ('pending','retry') and q.next_attempt_at<=now())
      or (q.status='sending' and q.lease_until<=now())
    ) order by q.next_attempt_at,q.alert_id
    for update of q skip locked limit 10
  )
  update public.pegasus_email_outbox q
  set status='sending', attempts=q.attempts+1, lease_token='00000000-0000-4000-8000-000000000001'::uuid,
    lease_until=now()+interval '30 minutes', updated_at=now()
  from due where q.alert_id=due.alert_id
  returning q.alert_id,q.lease_token,q.attempts
$claim$;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Due retry claim failed'; end if;
  update public.pegasus_email_outbox set lease_until=now()-interval '1 second' where status='sending';
  execute $claim$
  with due as (
    select q.alert_id from public.pegasus_email_outbox q
    join public.pegasus_email_config c on c.owner_id=q.owner_id
    where c.enabled and q.attempts<5 and (
      (q.status in ('pending','retry') and q.next_attempt_at<=now())
      or (q.status='sending' and q.lease_until<=now())
    ) order by q.next_attempt_at,q.alert_id
    for update of q skip locked limit 10
  )
  update public.pegasus_email_outbox q
  set status='sending', attempts=q.attempts+1, lease_token='00000000-0000-4000-8000-000000000001'::uuid,
    lease_until=now()+interval '30 minutes', updated_at=now()
  from due where q.alert_id=due.alert_id
  returning q.alert_id,q.lease_token,q.attempts
$claim$;
  get diagnostics n=row_count;
  if n<>1 then raise exception 'Expired lease recovery failed'; end if;
  begin
    insert into public.pegasus_email_outbox(alert_id,owner_id) values(low_alert,foreign_owner);
    raise exception 'Foreign owner accepted';
  exception when foreign_key_violation then null;
  end;
  if exists(select 1 from public.pegasus_email_outbox where alert_id=low_alert) then raise exception 'Low alert queued'; end if;
  if exists(select 1 from pg_class where oid in ('public.pegasus_email_config'::regclass,'public.pegasus_email_outbox'::regclass) and not relrowsecurity) then raise exception 'RLS missing'; end if;
  if exists(select 1 from (values('anon'),('authenticated')) r(role)
    cross join (values('public.pegasus_email_config'),('public.pegasus_email_outbox')) t(tbl)
    cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(priv)
    where has_table_privilege(r.role,t.tbl,p.priv)) then raise exception 'Client privileges leaked'; end if;
end
$test$;
rollback;
select 'passed: filtering, uniqueness, claims, retry timing, lease recovery, foreign-owner FK, RLS and revoked client CRUD; fixtures rolled back' as email_outbox_rehearsal;
