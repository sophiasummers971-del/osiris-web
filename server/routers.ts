

import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { COOKIE_NAME } from "./_core/cookies";
import { getSupporterTiers, getExclusiveContent, getSupporterStats } from "./supporters";
import { notificationRouter } from "./notifications";
import { createCheckoutSession, getUserOrders, getUserSubscription, getProducts } from "./stripe";

export const appRouter = router({
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

  supporters: router({
    getTiers: publicProcedure.query(async () => {
      return getSupporterTiers();
    }),
    
    getContent: publicProcedure.query(async () => {
      return getExclusiveContent();
    }),
    
    getStats: publicProcedure.query(async () => {
      return getSupporterStats();
    }),
  }),

  notifications: notificationRouter,

  stripe: router({
    createCheckoutSession,
    getUserOrders,
    getUserSubscription,
    getProducts,
  }),
});

export type AppRouter = typeof appRouter;
