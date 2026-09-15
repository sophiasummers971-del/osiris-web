import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  assertGitHubOAuthConfiguration,
  createGitHubOAuthRequest,
  exchangeGitHubOAuthCode,
  getGitHubAccount,
  readGitHubOAuthState,
  revokeGitHubOAuthToken,
} from "./monitoring/github-oauth.js";
import {
  decryptMonitoringToken,
  encryptMonitoringToken,
} from "./monitoring/token-crypto.js";
import {
  disconnectMonitoringConnection,
  getOwnedMonitoringConnectionSecret,
  listMonitoringConnections,
  upsertGitHubConnection,
} from "./monitoring/connection-store.js";
import { ensureVaultOperator, getVaultDb } from "./vault-db.js";
import { protectedProcedure, router } from "./_core/trpc.js";

function requireDb(databaseUrl: string | null) {
  const db = getVaultDb(databaseUrl);
  if (!db) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Supabase Vault is not configured",
    });
  }
  return db;
}

function requireGitHubConfiguration(
  configuration: Parameters<typeof assertGitHubOAuthConfiguration>[0]
) {
  try {
    return assertGitHubOAuthConfiguration(configuration);
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "GitHub monitoring is not configured",
    });
  }
}

export const monitoringRouter = router({
  listConnections: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb(ctx.databaseUrl);
    const operator = await ensureVaultOperator(db, ctx.user);
    return listMonitoringConnections(db, operator.id);
  }),

  beginGitHubConnection: protectedProcedure.mutation(async ({ ctx }) => {
    const db = requireDb(ctx.databaseUrl);
    const operator = await ensureVaultOperator(db, ctx.user);
    const configuration = requireGitHubConfiguration(ctx.githubOAuth);
    const protocol = ctx.req.protocol === "http" ? "http" : "https";
    const callbackUrl = `${protocol}://${ctx.req.hostname}/integrations/github/callback`;
    const request = await createGitHubOAuthRequest({
      ownerId: operator.id,
      callbackUrl,
      configuration,
    });
    return {
      authorizationUrl: request.authorizationUrl,
      state: request.state,
    };
  }),

  completeGitHubConnection: protectedProcedure
    .input(
      z.object({
        code: z.string().trim().min(1).max(512),
        state: z.string().trim().min(1).max(4_096),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(ctx.databaseUrl);
      const operator = await ensureVaultOperator(db, ctx.user);
      const configuration = requireGitHubConfiguration(ctx.githubOAuth);
      let state;
      try {
        state = await readGitHubOAuthState({
          state: input.state,
          tokenEncryptionKey: configuration.tokenEncryptionKey,
        });
      } catch {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "GitHub authorization state is invalid or expired",
        });
      }
      if (state.ownerId !== operator.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Account mismatch" });
      }
      try {
        const token = await exchangeGitHubOAuthCode({
          code: input.code,
          configuration,
        });
        const account = await getGitHubAccount({
          accessToken: token.accessToken,
        });
        const encryptedAccessToken = await encryptMonitoringToken(
          token.accessToken,
          configuration.tokenEncryptionKey
        );
        const connection = await upsertGitHubConnection({
          db,
          ownerId: operator.id,
          account,
          encryptedAccessToken,
          scopes: token.scopes,
        });
        return { connected: true as const, connectionId: connection.id };
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "GitHub connection could not be completed",
        });
      }
    }),

  disconnect: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(ctx.databaseUrl);
      const operator = await ensureVaultOperator(db, ctx.user);
      const configuration = requireGitHubConfiguration(ctx.githubOAuth);
      const connection = await getOwnedMonitoringConnectionSecret(
        db,
        operator.id,
        input.connectionId
      );
      if (!connection) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Connection not found",
        });
      }
      if (connection.provider !== "github" || !connection.encryptedAccessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "GitHub connection is already disconnected",
        });
      }
      try {
        const accessToken = await decryptMonitoringToken(
          connection.encryptedAccessToken,
          configuration.tokenEncryptionKey
        );
        await revokeGitHubOAuthToken({ accessToken, configuration });
      } catch {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "GitHub did not confirm token revocation",
        });
      }
      const disconnected = await disconnectMonitoringConnection(
        db,
        operator.id,
        input.connectionId
      );
      return { disconnected };
    }),
});
