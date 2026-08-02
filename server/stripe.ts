import { protectedProcedure, publicProcedure } from "./_core/trpc.js";
import { z } from "zod";
import Stripe from "stripe";
import { getDb } from "./db.js";
import { orders, products, subscriptions, stripeCustomers } from "../drizzle/schema.js";
import { eq } from "drizzle-orm";

let stripeClient: Stripe | undefined;

/**
 * Initialise Stripe only when a payment operation is actually requested.
 * Importing the application router must remain safe in tests and in local
 * environments where payments are not configured.
 */
const getStripeClient = () => {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("Stripe is not configured: STRIPE_SECRET_KEY is missing");
  }

  stripeClient ??= new Stripe(apiKey);
  return stripeClient;
};

/**
 * Get or create a Stripe customer for the current user
 */
export const getOrCreateStripeCustomer = async (userId: number, email: string, name?: string) => {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Check if customer already exists
  const existing = await db
    .select()
    .from(stripeCustomers)
    .where(eq(stripeCustomers.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].stripeCustomerId;
  }

  // Create new Stripe customer
  const customer = await getStripeClient().customers.create({
    email,
    name: name || email,
    metadata: {
      userId: userId.toString(),
    },
  });

  // Save to database
  await db.insert(stripeCustomers).values({
    userId,
    stripeCustomerId: customer.id,
  });

  return customer.id;
};

/**
 * Create a checkout session for a product
 */
export const createCheckoutSession = protectedProcedure
  .input(
    z.object({
      productId: z.number(),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const user = ctx.user;
    if (!user) throw new Error("User not authenticated");

    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // Get product
    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);

    if (!product.length) throw new Error("Product not found");

    const prod = product[0];

    // Get or create Stripe customer
    const customerId = await getOrCreateStripeCustomer(user.id, user.email || "", user.name || undefined);

    // Create checkout session
    const session = await getStripeClient().checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: prod.stripePriceId,
          quantity: 1,
        },
      ],
      mode: prod.interval === "one_time" ? "payment" : "subscription",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: user.id.toString(),
      metadata: {
        userId: user.id.toString(),
        productId: input.productId.toString(),
      },
    });

    return { sessionUrl: session.url };
  });

/**
 * Get user's orders
 */
export const getUserOrders = protectedProcedure.query(async ({ ctx }) => {
  const user = ctx.user;
  if (!user) throw new Error("User not authenticated");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const userOrders = await db
    .select()
    .from(orders)
    .where(eq(orders.userId, user.id));

  return userOrders;
});

/**
 * Get user's active subscription
 */
export const getUserSubscription = protectedProcedure.query(async ({ ctx }) => {
  const user = ctx.user;
  if (!user) throw new Error("User not authenticated");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const userSubscription = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);

  if (!userSubscription.length) return null;

  return userSubscription[0];
});

/**
 * Get all available products
 */
export const getProducts = publicProcedure.query(async () => {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const allProducts = await db
    .select()
    .from(products)
    .where(eq(products.active, true));

  return allProducts;
});

/**
 * Handle Stripe webhook events (called from Express route)
 */
export const handleStripeWebhook = async (event: Stripe.Event) => {
  const db = await getDb();
  if (!db) {
    console.error("Database not available for webhook processing");
    return;
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = parseInt(session.client_reference_id || "0");
      const metadata = session.metadata || {};
      const productId = parseInt(metadata.productId || "0");

      if (session.mode === "payment") {
        // One-time payment
        const paymentIntent = await getStripeClient().paymentIntents.retrieve(
          session.payment_intent as string
        );

        await db.insert(orders).values({
          userId,
          productId,
          stripePaymentIntentId: paymentIntent.id,
          stripeCustomerId: session.customer as string,
          amount: (paymentIntent.amount_received / 100).toString(), // Convert from cents to dollars
          currency: paymentIntent.currency.toUpperCase(),
          status: "succeeded",
          metadata: JSON.stringify(metadata),
        });
      } else if (session.mode === "subscription") {
        // Subscription
        const subscription = await getStripeClient().subscriptions.retrieve(
          session.subscription as string
        );
        const sub = subscription as any;

        await db.insert(subscriptions).values({
          userId,
          productId,
          stripeSubscriptionId: sub.id,
          stripeCustomerId: session.customer as string,
          status: sub.status as any,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
        });
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as any).subscription;
      if (!subId) break;
      const subscription = await getStripeClient().subscriptions.retrieve(subId as string);

      // Update subscription status
      const sub = subscription as any;
      await db
        .update(subscriptions)
        .set({
          status: sub.status as any,
          currentPeriodStart: new Date(sub.current_period_start * 1000),
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
        })
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;

      await db
        .update(subscriptions)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = (invoice as any).subscription;
      if (!subId) break;
      const subscription = await getStripeClient().subscriptions.retrieve(subId as string);

      await db
        .update(subscriptions)
        .set({
          status: "past_due",
        })
        .where(eq(subscriptions.stripeSubscriptionId, subscription.id));
      break;
    }
  }
};
