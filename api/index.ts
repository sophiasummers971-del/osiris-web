import "dotenv/config";
import express from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import Stripe from "stripe";
import { registerOAuthRoutes } from "../server/_core/oauth.js";
import { registerStorageProxy } from "../server/_core/storageProxy.js";
import { createContext } from "../server/_core/context.js";
import { appRouter } from "../server/routers.js";
import { handleStripeWebhook } from "../server/stripe.js";

const app = express();

// Vercel invokes this function at /api/index. Restore the original nested API
// path passed by vercel.json before Express and tRPC perform route matching.
app.use((req, _res, next) => {
  const requestUrl = new URL(req.url, "http://vercel.internal");
  const forwardedPath = requestUrl.searchParams.get("__path");

  if (forwardedPath) {
    requestUrl.searchParams.delete("__path");
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${forwardedPath}${query ? `?${query}` : ""}`;
  }

  next();
});

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];

    if (!webhookSecret || typeof signature !== "string") {
      return res.status(400).send("Webhook is not configured");
    }

    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
      const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
      await handleStripeWebhook(event);
      return res.json({ received: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown webhook error";
      return res.status(400).send(`Webhook Error: ${message}`);
    }
  },
);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
registerStorageProxy(app);
registerOAuthRoutes(app);
app.use(
  "/api/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

export default app;
