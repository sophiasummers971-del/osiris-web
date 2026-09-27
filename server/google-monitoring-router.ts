import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc.js";
import { ensureVaultOperator, getVaultDb } from "./vault-db.js";
import {
  beginGoogleAuthorization,
  completeGoogleAuthorization,
  requireGoogleConfiguration,
  revokeGoogleToken,
} from "./monitoring/google-oauth.js";
import {
  encryptMonitoringToken,
  decryptMonitoringToken,
} from "./monitoring/token-crypto.js";
import {
  upsertGoogleConnection,
  getOwnedMonitoringConnectionSecret,
  disconnectMonitoringConnection,
} from "./monitoring/connection-store.js";
function dbFor(url: string | null) {
  const db = getVaultDb(url);
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Monitoring database is unavailable",
    });
  return db;
}
export const googleMonitoringRouter = router({
  configuration: protectedProcedure.query(({ ctx }) => {
    try {
      requireGoogleConfiguration(ctx.googleOAuth);
      return { configured: true };
    } catch {
      return { configured: false };
    }
  }),
  begin: protectedProcedure.mutation(async ({ ctx }) => {
    const db = dbFor(ctx.databaseUrl);
    const operator = await ensureVaultOperator(db, ctx.user);
    try {
      return await beginGoogleAuthorization(operator.id, ctx.googleOAuth ?? {});
    } catch {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Google monitoring setup is not complete",
      });
    }
  }),
  complete: protectedProcedure
    .input(
      z.object({
        code: z.string().min(1).max(2048),
        state: z.string().min(1).max(4096),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = dbFor(ctx.databaseUrl);
      const operator = await ensureVaultOperator(db, ctx.user);
      try {
        const config = requireGoogleConfiguration(ctx.googleOAuth);
        const account = await completeGoogleAuthorization(
          input.code,
          input.state,
          operator.id,
          config
        );
        const encryptedAccessToken = await encryptMonitoringToken(
          account.accessToken,
          config.tokenEncryptionKey
        );
        const encryptedRefreshToken = await encryptMonitoringToken(
          account.refreshToken!,
          config.tokenEncryptionKey
        );
        const result = await upsertGoogleConnection({
          db,
          ownerId: operator.id,
          accountId: account.accountId,
          email: account.email,
          encryptedAccessToken,
          encryptedRefreshToken,
          historyId: account.historyId,
        });
        return { connected: true, connectionId: result.id };
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Google connection could not be completed. Check consent and setup, then retry from OSIRIS.",
        });
      }
    }),
  disconnect: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = dbFor(ctx.databaseUrl);
      const operator = await ensureVaultOperator(db, ctx.user);
      const connection = await getOwnedMonitoringConnectionSecret(
        db,
        operator.id,
        input.connectionId
      );
      if (!connection || connection.provider !== "google")
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Google connection not found",
        });
      let revoked = false;
      try {
        const config = requireGoogleConfiguration(ctx.googleOAuth);
        const ciphertext =
          connection.encryptedRefreshToken ?? connection.encryptedAccessToken;
        if (ciphertext) {
          await revokeGoogleToken(
            await decryptMonitoringToken(ciphertext, config.tokenEncryptionKey)
          );
          revoked = true;
        }
      } catch {
        /* Local disconnect must still stop monitoring if provider is unavailable. */
      }
      await disconnectMonitoringConnection(db, operator.id, connection.id);
      return { disconnected: true, revoked };
    }),
});
