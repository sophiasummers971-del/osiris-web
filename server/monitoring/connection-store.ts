import { and, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import {
  monitoringConnections,
  monitoringObservations,
  monitoringRuns,
} from "../../drizzle/vault-schema.js";
import type { getVaultDb } from "../vault-db.js";
import type { GitHubAccount } from "./github-oauth.js";

type VaultDb = NonNullable<ReturnType<typeof getVaultDb>>;

export async function upsertGitHubConnection(options: {
  db: VaultDb;
  ownerId: number;
  account: GitHubAccount;
  encryptedAccessToken: string;
  scopes: string[];
}) {
  const now = new Date();
  const [connection] = await options.db
    .insert(monitoringConnections)
    .values({
      ownerId: options.ownerId,
      provider: "github",
      providerAccountId: String(options.account.id),
      displayName: options.account.login,
      status: "active",
      scopes: options.scopes,
      encryptedAccessToken: options.encryptedAccessToken,
      checkpoint: {
        login: options.account.login,
        name: options.account.name,
        avatarUrl: options.account.avatarUrl,
        twoFactorAuthentication: options.account.twoFactorAuthentication,
      },
      nextCheckAt: now,
      lastErrorCode: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        monitoringConnections.ownerId,
        monitoringConnections.provider,
        monitoringConnections.providerAccountId,
      ],
      set: {
        displayName: options.account.login,
        status: "active",
        scopes: options.scopes,
        encryptedAccessToken: options.encryptedAccessToken,
        checkpoint: {
          login: options.account.login,
          name: options.account.name,
          avatarUrl: options.account.avatarUrl,
          twoFactorAuthentication: options.account.twoFactorAuthentication,
        },
        nextCheckAt: now,
        lastErrorCode: null,
        updatedAt: now,
      },
    })
    .returning({ id: monitoringConnections.id });
  if (!connection) throw new Error("GitHub connection storage failed");
  return connection;
}

export async function listMonitoringConnections(db: VaultDb, ownerId: number) {
  return db
    .select({
      id: monitoringConnections.id,
      provider: monitoringConnections.provider,
      providerAccountId: monitoringConnections.providerAccountId,
      displayName: monitoringConnections.displayName,
      status: monitoringConnections.status,
      scopes: monitoringConnections.scopes,
      lastCheckedAt: monitoringConnections.lastCheckedAt,
      nextCheckAt: monitoringConnections.nextCheckAt,
      lastErrorCode: monitoringConnections.lastErrorCode,
      createdAt: monitoringConnections.createdAt,
      updatedAt: monitoringConnections.updatedAt,
    })
    .from(monitoringConnections)
    .where(eq(monitoringConnections.ownerId, ownerId))
    .orderBy(desc(monitoringConnections.updatedAt));
}

export async function disconnectMonitoringConnection(
  db: VaultDb,
  ownerId: number,
  connectionId: number
) {
  const [connection] = await db
    .update(monitoringConnections)
    .set({
      status: "disconnected",
      encryptedAccessToken: null,
      encryptedRefreshToken: null,
      nextCheckAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(monitoringConnections.id, connectionId),
        eq(monitoringConnections.ownerId, ownerId)
      )
    )
    .returning({ id: monitoringConnections.id });
  return Boolean(connection);
}

export async function getOwnedMonitoringConnectionSecret(
  db: VaultDb,
  ownerId: number,
  connectionId: number
) {
  const [connection] = await db
    .select({
      id: monitoringConnections.id,
      provider: monitoringConnections.provider,
      encryptedAccessToken: monitoringConnections.encryptedAccessToken,
    })
    .from(monitoringConnections)
    .where(
      and(
        eq(monitoringConnections.id, connectionId),
        eq(monitoringConnections.ownerId, ownerId)
      )
    )
    .limit(1);
  return connection ?? null;
}

export async function claimDueMonitoringConnections(
  db: VaultDb,
  now: Date,
  nextCheckAt: Date,
  limit = 10,
  options: { ownerId?: number; connectionId?: number; force?: boolean } = {}
) {
  const due = await db
    .select()
    .from(monitoringConnections)
    .where(
      and(
        eq(monitoringConnections.status, "active"),
        isNotNull(monitoringConnections.encryptedAccessToken),
        options.ownerId === undefined
          ? undefined
          : eq(monitoringConnections.ownerId, options.ownerId),
        options.connectionId === undefined
          ? undefined
          : eq(monitoringConnections.id, options.connectionId),
        options.force ? undefined : lte(monitoringConnections.nextCheckAt, now)
      )
    )
    .orderBy(monitoringConnections.nextCheckAt)
    .limit(limit);

  const claimed: typeof due = [];
  for (const connection of due) {
    const [updated] = await db
      .update(monitoringConnections)
      .set({ nextCheckAt, updatedAt: now })
      .where(
        and(
          eq(monitoringConnections.id, connection.id),
          eq(monitoringConnections.status, "active"),
          options.ownerId === undefined
            ? undefined
            : eq(monitoringConnections.ownerId, options.ownerId),
          options.connectionId === undefined
            ? undefined
            : eq(monitoringConnections.id, options.connectionId),
          options.force
            ? connection.nextCheckAt
              ? eq(monitoringConnections.nextCheckAt, connection.nextCheckAt)
              : isNull(monitoringConnections.nextCheckAt)
            : lte(monitoringConnections.nextCheckAt, now)
        )
      )
      .returning();
    if (updated) claimed.push(updated);
  }
  return claimed;
}

export async function startMonitoringRun(
  db: VaultDb,
  connection: typeof monitoringConnections.$inferSelect
) {
  const [run] = await db
    .insert(monitoringRuns)
    .values({
      connectionId: connection.id,
      ownerId: connection.ownerId,
      checkpointBefore: connection.checkpoint,
    })
    .returning({ id: monitoringRuns.id });
  if (!run) throw new Error("Monitoring run storage failed");
  return run;
}

export async function stageMonitoringObservation(options: {
  db: VaultDb;
  connectionId: number;
  ownerId: number;
  runId: string;
  externalId: string;
  kind: string;
  observedAt: Date;
  payload: Record<string, unknown>;
}) {
  await options.db
    .insert(monitoringObservations)
    .values({
      connectionId: options.connectionId,
      ownerId: options.ownerId,
      runId: options.runId,
      externalId: options.externalId,
      kind: options.kind,
      observedAt: options.observedAt,
      payload: options.payload,
    })
    .onConflictDoNothing({
      target: [
        monitoringObservations.connectionId,
        monitoringObservations.externalId,
      ],
    });
  const [observation] = await options.db
    .select()
    .from(monitoringObservations)
    .where(
      and(
        eq(monitoringObservations.connectionId, options.connectionId),
        eq(monitoringObservations.externalId, options.externalId)
      )
    )
    .limit(1);
  if (!observation) throw new Error("Monitoring observation storage failed");
  return observation;
}

export async function linkObservationToPegasusEvent(
  db: VaultDb,
  observationId: number,
  eventId: number
) {
  await db
    .update(monitoringObservations)
    .set({ pegasusEventId: eventId })
    .where(
      and(
        eq(monitoringObservations.id, observationId),
        isNull(monitoringObservations.pegasusEventId)
      )
    );
}

export async function finishMonitoringRun(options: {
  db: VaultDb;
  runId: string;
  connectionId: number;
  checkpoint: Record<string, unknown>;
  observationCount: number;
  finishedAt: Date;
}) {
  await options.db.transaction(async tx => {
    await tx
      .update(monitoringRuns)
      .set({
        status: "succeeded",
        checkpointAfter: options.checkpoint,
        observationCount: options.observationCount,
        finishedAt: options.finishedAt,
      })
      .where(eq(monitoringRuns.id, options.runId));
    await tx
      .update(monitoringConnections)
      .set({
        checkpoint: options.checkpoint,
        lastCheckedAt: options.finishedAt,
        lastErrorCode: null,
        updatedAt: options.finishedAt,
      })
      .where(eq(monitoringConnections.id, options.connectionId));
  });
}

export async function failMonitoringRun(options: {
  db: VaultDb;
  runId: string;
  connectionId: number;
  errorCode: string;
  finishedAt: Date;
}) {
  await options.db.transaction(async tx => {
    await tx
      .update(monitoringRuns)
      .set({
        status: "failed",
        errorCode: options.errorCode,
        finishedAt: options.finishedAt,
      })
      .where(eq(monitoringRuns.id, options.runId));
    await tx
      .update(monitoringConnections)
      .set({
        lastCheckedAt: options.finishedAt,
        lastErrorCode: options.errorCode,
        updatedAt: options.finishedAt,
      })
      .where(eq(monitoringConnections.id, options.connectionId));
  });
}
