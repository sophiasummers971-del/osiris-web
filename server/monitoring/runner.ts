import { monitorGoogleMail } from "./google-monitor.js";
import { googleToken, type GoogleConfiguration } from "./google-oauth.js";
import { requireMonitoringReauthorization } from "./connection-store.js";
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
  googleOAuth?: GoogleConfiguration;
  databaseUrl: string | null;
  tokenEncryptionKey?: string;
  ownerId?: number;
  connectionId?: number;
  force?: boolean;
};

export async function runDueMonitoring(
  environment: MonitoringRunnerEnvironment,
  now = new Date()
) {
  if (!environment.databaseUrl) {
    return {
      processed: 0,
      failed: 0,
      configured: false,
      configurationError: "MONITORING_DATABASE_UNAVAILABLE",
    } as const;
  }
  if (!environment.tokenEncryptionKey) {
    return {
      processed: 0,
      failed: 0,
      configured: false,
      configurationError: "MONITORING_TOKEN_KEY_UNAVAILABLE",
    } as const;
  }
  const db = getVaultDb(environment.databaseUrl);
  if (!db) {
    return {
      processed: 0,
      failed: 0,
      configured: false,
      configurationError: "MONITORING_DATABASE_UNAVAILABLE",
    } as const;
  }
  const connections = await claimDueMonitoringConnections(
    db,
    now,
    new Date(now.getTime() + POLL_INTERVAL_MS),
    10,
    {
      ownerId: environment.ownerId,
      connectionId: environment.connectionId,
      force: environment.force,
    }
  );
  let processed = 0;
  let failed = 0;

  for (const connection of connections) {
    const run = await startMonitoringRun(db, connection);
    try {
      if (!connection.encryptedAccessToken) {
        throw new Error("MISSING_ENCRYPTED_TOKEN");
      }
      let result;
      if (connection.provider === "google") {
        if (!connection.encryptedRefreshToken)
          throw new Error("GOOGLE_REAUTHORIZATION_REQUIRED");
        const refreshToken = await decryptMonitoringToken(
          connection.encryptedRefreshToken,
          environment.tokenEncryptionKey
        );
        const token = await googleToken(
          { grant_type: "refresh_token", refresh_token: refreshToken },
          environment.googleOAuth ?? {}
        );
        result = await monitorGoogleMail({
          accessToken: token.accessToken,
          accountId: connection.providerAccountId,
          previousCheckpoint: connection.checkpoint,
          observedAt: now,
        });
      } else if (connection.provider === "github") {
        const accessToken = await decryptMonitoringToken(
          connection.encryptedAccessToken,
          environment.tokenEncryptionKey
        );
        const github = await monitorGitHubAccount({
          accessToken,
          previousCheckpoint: connection.checkpoint,
          observedAt: now,
        });
        result = {
          checkpoint: github.checkpoint,
          observations: github.observation ? [github.observation] : [],
        };
      } else throw new Error("UNSUPPORTED_PROVIDER");
      let observationCount = 0;
      for (const item of result.observations) {
        const observation = await stageMonitoringObservation({
          db,
          connectionId: connection.id,
          ownerId: connection.ownerId,
          runId: run.id,
          externalId: item.externalId,
          kind: item.kind,
          observedAt: item.event.observedAt,
          payload: {
            source: item.event.source,
            category: item.event.category,
            signal: item.event.signal,
            severity: item.event.severity,
            confidence: item.event.confidence,
            details: item.event.details,
          },
        });
        if (!observation.pegasusEventId) {
          const recorded = await recordPegasusEvent(
            db,
            connection.ownerId,
            item.event,
            item.externalId
          );
          await linkObservationToPegasusEvent(
            db,
            observation.id,
            recorded.eventId
          );
          observationCount += 1;
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
      const googleErrors = [
        "GOOGLE_REAUTHORIZATION_REQUIRED",
        "GOOGLE_HISTORY_EXPIRED",
        "GOOGLE_MAIL_BACKLOG",
        "GOOGLE_NOT_CONFIGURED",
      ];
      const errorCode =
        connection.provider === "google"
          ? error instanceof Error && googleErrors.includes(error.message)
            ? error.message
            : "GOOGLE_MONITORING_FAILED"
          : error instanceof Error &&
              error.message === "MISSING_ENCRYPTED_TOKEN"
            ? "MISSING_ENCRYPTED_TOKEN"
            : "GITHUB_MONITORING_FAILED";
      if (
        connection.provider === "google" &&
        ["GOOGLE_REAUTHORIZATION_REQUIRED", "GOOGLE_HISTORY_EXPIRED"].includes(
          errorCode
        )
      )
        await requireMonitoringReauthorization(db, connection.id);
      await failMonitoringRun({
        db,
        runId: run.id,
        connectionId: connection.id,
        errorCode,
        finishedAt: new Date(),
      });
      failed += 1;
    }
  }
  return {
    processed,
    failed,
    configured: true,
    configurationError: null,
  } as const;
}
