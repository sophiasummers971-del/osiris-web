import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ensureVaultOperator, getVaultDb } from "./vault-db.js";
import {
  acknowledgePegasusAlert,
  getPegasusOverview,
  listPegasusAlerts,
} from "./pegasus-store.js";
import { protectedProcedure, router } from "./_core/trpc.js";

function requireDb(databaseUrl: string | null) {
  const db = getVaultDb(databaseUrl);
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "PEGASUS storage is not configured",
    });
  return db;
}

export const pegasusRouter = router({
  listAlerts: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const db = requireDb(ctx.databaseUrl);
      const operator = await ensureVaultOperator(db, ctx.user);
      return listPegasusAlerts(db, operator.id, input.limit);
    }),
  overview: protectedProcedure.query(async ({ ctx }) => {
    const db = requireDb(ctx.databaseUrl);
    const operator = await ensureVaultOperator(db, ctx.user);
    return getPegasusOverview(db, operator.id);
  }),
  acknowledgeAlert: protectedProcedure
    .input(z.object({ alertId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = requireDb(ctx.databaseUrl);
      const operator = await ensureVaultOperator(db, ctx.user);
      const acknowledged = await acknowledgePegasusAlert(
        db,
        operator.id,
        input.alertId
      );
      if (!acknowledged)
        throw new TRPCError({ code: "NOT_FOUND", message: "Alert not found" });
      return { acknowledged: true } as const;
    }),
});
