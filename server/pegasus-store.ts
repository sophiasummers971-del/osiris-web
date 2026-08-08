import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  pegasusAlerts,
  pegasusSecurityEvents,
} from "../drizzle/vault-schema.js";
import type { getVaultDb } from "./vault-db.js";
import {
  evaluatePegasusEvent,
  sealPegasusEvent,
  verifyPegasusEventChain,
  type PegasusEvent,
} from "./pegasus.js";

type VaultDb = NonNullable<ReturnType<typeof getVaultDb>>;

export async function recordPegasusEvent(
  db: VaultDb,
  ownerId: number,
  event: PegasusEvent
) {
  return db.transaction(async tx => {
    // One writer per owner keeps the hash chain linear under concurrent collectors.
    await tx.execute(sql`select pg_advisory_xact_lock(${ownerId})`);
    const [previous] = await tx
      .select({ eventHash: pegasusSecurityEvents.eventHash })
      .from(pegasusSecurityEvents)
      .where(eq(pegasusSecurityEvents.ownerId, ownerId))
      .orderBy(desc(pegasusSecurityEvents.id))
      .limit(1);
    const seal = await sealPegasusEvent(event, previous?.eventHash ?? null);
    const [stored] = await tx
      .insert(pegasusSecurityEvents)
      .values({ ownerId, ...event, ...seal })
      .returning({ id: pegasusSecurityEvents.id });
    if (!stored) throw new Error("PEGASUS event storage failed");

    const alerts = evaluatePegasusEvent(event);
    if (alerts.length) {
      await tx
        .insert(pegasusAlerts)
        .values(
          alerts.map(alert => ({ ownerId, eventId: stored.id, ...alert }))
        );
    }
    return { eventId: stored.id, alertCount: alerts.length };
  });
}

export async function getPegasusOverview(db: VaultDb, ownerId: number) {
  const [events, alerts] = await Promise.all([
    db
      .select()
      .from(pegasusSecurityEvents)
      .where(eq(pegasusSecurityEvents.ownerId, ownerId))
      .orderBy(asc(pegasusSecurityEvents.id)),
    db
      .select()
      .from(pegasusAlerts)
      .where(eq(pegasusAlerts.ownerId, ownerId))
      .orderBy(desc(pegasusAlerts.createdAt))
      .limit(20),
  ]);
  const integrity = await verifyPegasusEventChain(events);
  return {
    integrity,
    eventCount: events.length,
    openAlertCount: alerts.filter(alert => alert.status === "open").length,
    latestEvents: events.slice(-20).reverse(),
    alerts,
  };
}

export async function acknowledgePegasusAlert(
  db: VaultDb,
  ownerId: number,
  alertId: number
) {
  const [updated] = await db
    .update(pegasusAlerts)
    .set({ status: "acknowledged" })
    .where(
      and(eq(pegasusAlerts.id, alertId), eq(pegasusAlerts.ownerId, ownerId))
    )
    .returning({ id: pegasusAlerts.id });
  return Boolean(updated);
}
