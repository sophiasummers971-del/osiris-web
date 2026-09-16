import { sql, type SQL } from "drizzle-orm";
import { getVaultDb } from "./vault-db.js";

export type EmailDeliveryState =
  | "pending"
  | "sending"
  | "retry"
  | "accepted"
  | "failed";
export type ClaimedEmail = {
  alert_id: number;
  lease_token: string;
  attempts: number;
};
export const MAX_EMAIL_ATTEMPTS = 5;

export function emailFailure(attempts: number, now: Date) {
  if (attempts >= MAX_EMAIL_ATTEMPTS)
    return { status: "failed" as const, nextAttemptAt: now };
  return {
    status: "retry" as const,
    nextAttemptAt: new Date(
      now.getTime() + 15 * 60 * 1000 * 2 ** (attempts - 1)
    ),
  };
}

// Keep SQL builders exported so the exact production queries can be rehearsed.
export const enqueueEmailsSql = () => sql`
  insert into public.pegasus_email_outbox (alert_id, owner_id)
  select a.id, a.owner_id from public.pegasus_alerts a
  join public.pegasus_email_config c on c.owner_id=a.owner_id
  where c.enabled and a.id>c.start_after_alert_id
    and a.severity in ('high','critical')
  on conflict (alert_id) do nothing
`;

export const claimEmailsSql = (token: string) => sql`
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
  set status='sending', attempts=q.attempts+1, lease_token=${token}::uuid,
    lease_until=now()+interval '30 minutes', updated_at=now()
  from due where q.alert_id=due.alert_id
  returning q.alert_id,q.lease_token,q.attempts
`;

export const finishEmailSql = (
  item: ClaimedEmail,
  status: "accepted" | "retry" | "failed",
  nextAttemptAt: Date
) => sql`
  update public.pegasus_email_outbox
  set status=${status}, next_attempt_at=${nextAttemptAt.toISOString()}::timestamptz,
    accepted_at=case when ${status}='accepted' then now() else accepted_at end,
    last_error=case when ${status}='accepted' then null else 'EMAIL_SEND_FAILED' end,
    lease_token=null,lease_until=null,updated_at=now()
  where alert_id=${item.alert_id} and status='sending'
    and lease_token=${item.lease_token}::uuid
  returning alert_id
`;

type Executor = { execute(query: SQL): Promise<unknown> };

export async function dispatchEmailBatch(
  db: Executor,
  send: (alertId: number) => Promise<void>
) {
  await db.execute(enqueueEmailsSql());
  // A final-attempt crash must become visible as terminal failure, not stuck forever.
  await db.execute(sql`update public.pegasus_email_outbox
    set status='failed',last_error='EMAIL_ACCEPTANCE_UNKNOWN',lease_token=null,
      lease_until=null,updated_at=now()
    where status='sending' and attempts>=5 and lease_until<=now()`);
  const rows = (await db.execute(
    claimEmailsSql(crypto.randomUUID())
  )) as ClaimedEmail[];
  let accepted = 0;
  let failed = 0;
  for (const item of rows) {
    let providerAccepted = false;
    try {
      await send(item.alert_id);
      providerAccepted = true;
    } catch {
      failed++;
    }
    // Do not treat a DB failure after provider acceptance as a send rejection.
    const result = providerAccepted
      ? { status: "accepted" as const, nextAttemptAt: new Date() }
      : emailFailure(item.attempts, new Date());
    const updated = (await db.execute(
      finishEmailSql(item, result.status, result.nextAttemptAt)
    )) as unknown[];
    if (providerAccepted && updated.length) accepted++;
  }
  return { claimed: rows.length, accepted, failed };
}

export async function runEmailAlarms(
  databaseUrl: string | null,
  send?: (alertId: number) => Promise<void>
) {
  if (!databaseUrl || !send) throw new Error("EMAIL_ALARMS_NOT_CONFIGURED");
  const db = getVaultDb(databaseUrl);
  if (!db) throw new Error("EMAIL_ALARMS_NOT_CONFIGURED");
  return dispatchEmailBatch(db, send);
}

export async function getEmailAlarmStatus(db: Executor, ownerId: number) {
  const config = (await db.execute(sql`select enabled,enabled_at as "enabledAt"
    from public.pegasus_email_config where owner_id=${ownerId}`)) as {
    enabled: boolean;
    enabledAt: Date | null;
  }[];
  const deliveries =
    (await db.execute(sql`select alert_id as "alertId",status,attempts,
    next_attempt_at as "nextAttemptAt",accepted_at as "acceptedAt",last_error as "lastError"
    from public.pegasus_email_outbox where owner_id=${ownerId}
    order by alert_id desc limit 50`)) as {
      alertId: number;
      status: EmailDeliveryState;
      attempts: number;
      nextAttemptAt: Date;
      acceptedAt: Date | null;
      lastError: string | null;
    }[];
  return {
    enabled: config[0]?.enabled ?? false,
    enabledAt: config[0]?.enabledAt ?? null,
    deliveries: deliveries.map(d => ({ ...d, alertId: Number(d.alertId) })),
  };
}
