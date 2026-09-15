import { recordPegasusEvent } from "../pegasus-store.js";
import { getVaultDb } from "../vault-db.js";
import {
  claimDueMonitoringConnections,
  failMonitoringRun,
  finishMonitoringRun,
  linkObservationToPegasusEvent,
  stageMonitoringObservation,
  startMonitoringRun,
} from "./connection-store.js";
import { monitorGitHubAccount } from "./github-monitor.js";
import { decryptMonitoringToken } from "./token-crypto.js";

const POLL_INTERVAL_MS = 15 * 60 * 1000;

export type MonitoringRunnerEnvironment = {
  databaseUrl: string | null;
  tokenEncryptionKey?: string;
};

export async function runDueMonitoring(
  environment: MonitoringRunnerEnvironment,
  now = new Date()
) {
  const db = getVaultDb(environment.databaseUrl);
  if (!db || !environment.tokenEncryptionKey) {
    return { processed: 0, failed: 0, configured: false } as const;
  }
  const connections = await claimDueMonitoringConnections(
    db,
    now,
    new Date(now.getTime() + POLL_INTERVAL_MS)
  );
  let processed = 0;
  let failed = 0;

  for (const connection of connections) {
    const run = await startMonitoringRun(db, connection);
    try {
      if (!connection.encryptedAccessToken) {
        throw new Error("MISSING_ENCRYPTED_TOKEN");
      }
      const accessToken = await decryptMonitoringToken(
        connection.encryptedAccessToken,
        environment.tokenEncryptionKey
      );
      const result = await monitorGitHubAccount({
        accessToken,
        previousCheckpoint: connection.checkpoint,
        observedAt: now,
      });
      let observationCount = 0;
      if (result.observation) {
        const observation = await stageMonitoringObservation({
          db,
          connectionId: connection.id,
          ownerId: connection.ownerId,
          runId: run.id,
          externalId: result.observation.externalId,
          kind: result.observation.kind,
          observedAt: result.observation.event.observedAt,
          payload: {
            source: result.observation.event.source,
            category: result.observation.event.category,
            signal: result.observation.event.signal,
            severity: result.observation.event.severity,
            confidence: result.observation.event.confidence,
            details: result.observation.event.details,
          },
        });
        if (!observation.pegasusEventId) {
          const recorded = await recordPegasusEvent(
            db,
            connection.ownerId,
            result.observation.event,
            result.observation.externalId
          );
          await linkObservationToPegasusEvent(
            db,
            observation.id,
            recorded.eventId
          );
          observationCount = 1;
        }
      }
      await finishMonitoringRun({
        db,
        runId: run.id,
        connectionId: connection.id,
        checkpoint: result.checkpoint,
        observationCount,
        finishedAt: new Date(),
      });
      processed += 1;
    } catch (error) {
      await failMonitoringRun({
        db,
        runId: run.id,
        connectionId: connection.id,
        errorCode:
          error instanceof Error && error.message === "MISSING_ENCRYPTED_TOKEN"
            ? "MISSING_ENCRYPTED_TOKEN"
            : "GITHUB_MONITORING_FAILED",
        finishedAt: new Date(),
      });
      failed += 1;
    }
  }
  return { processed, failed, configured: true } as const;
}
