import { z } from "zod";
import { notifyOwner } from "./notification.js";
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./trpc.js";
import { ENV } from "./env.js";
import { assemblePosture, evaluateStaticPosture } from "./posture.js";
import { probeVaultDatabase } from "../vault-db.js";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  posture: protectedProcedure.query(async ({ ctx }) => {
    const [database] = await Promise.all([probeVaultDatabase()]);
    return assemblePosture({
      controls: evaluateStaticPosture(process.env, Boolean(ctx.user)),
      database,
      isProduction: ENV.isProduction,
      checkedAt: new Date(),
    });
  }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
