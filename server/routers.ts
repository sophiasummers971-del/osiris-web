import { googleMonitoringRouter } from "./google-monitoring-router.js";
import { getSessionCookieOptions } from "./_core/cookies.js";
import { systemRouter } from "./_core/systemRouter.js";
import { publicProcedure, router } from "./_core/trpc.js";
import { COOKIE_NAME } from "../shared/const.js";
import { casesRouter } from "./cases.js";
import { intelligenceRouter } from "./intelligence.js";
import { pegasusRouter } from "./pegasus-router.js";
import { monitoringRouter } from "./monitoring-router.js";

export const appRouter = router({
  googleMonitoring: googleMonitoringRouter,
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  cases: casesRouter,
  intelligence: intelligenceRouter,
  pegasus: pegasusRouter,
  monitoring: monitoringRouter,
});

export type AppRouter = typeof appRouter;
