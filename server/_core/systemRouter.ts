import { z } from "zod";
import { notifyOwner } from "./notification.js";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./trpc.js";
import { ENV } from "./env.js";

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

  posture: protectedProcedure.query(({ ctx }) => {
    const controls = [
      {
        id: "session",
        label: "Session signing",
        ready: Boolean(ENV.cookieSecret),
        critical: true,
      },
      {
        id: "identity",
        label: "Identity gateway",
        ready: Boolean(ENV.appId && ENV.oAuthServerUrl),
        critical: true,
      },
      {
        id: "database",
        label: "Operational database",
        ready: Boolean(ENV.databaseUrl),
        critical: true,
      },
      {
        id: "intelligence",
        label: "AI intelligence gateway",
        ready: Boolean(ENV.forgeApiUrl && ENV.forgeApiKey),
        critical: false,
      },
      {
        id: "payments",
        label: "Payment isolation",
        ready: Boolean(process.env.STRIPE_SECRET_KEY),
        critical: false,
      },
    ];

    const criticalReady = controls
      .filter(control => control.critical)
      .every(control => control.ready);

    return {
      status: criticalReady ? "READY" : "DEGRADED",
      authenticated: Boolean(ctx.user),
      environment: ENV.isProduction ? "PRODUCTION" : "DEVELOPMENT",
      checkedAt: new Date(),
      controls,
    } as const;
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
