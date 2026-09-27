import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "./trpc.js";
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
    const [database] = await Promise.all([
      probeVaultDatabase(undefined, ctx.databaseUrl),
    ]);
    return assemblePosture({
      controls: evaluateStaticPosture(
        ctx.postureEnvironment ?? {},
        Boolean(ctx.user),
        Boolean(ctx.ai)
      ),
      database,
      isProduction: ctx.isProduction ?? false,
      checkedAt: new Date(),
    });
  }),
});
