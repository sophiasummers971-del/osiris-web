import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, adminProcedure, router } from "./_core/trpc";
import {
  createNotification,
  getUserNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  dismissNotification,
  getOrCreateNotificationPreferences,
  updateNotificationPreferences,
  savePushSubscription,
  getUserPushSubscriptions,
  queueEmail,
} from "./db";

/**
 * Notification Router - handles all notification operations
 */
export const notificationRouter = router({
  /**
   * Get user's notifications (paginated)
   */
  getNotifications: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().positive().default(20),
        offset: z.number().int().nonnegative().default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const notifications = await getUserNotifications(
        ctx.user.id,
        input.limit,
        input.offset
      );

      return {
        notifications,
        total: notifications.length,
      };
    }),

  /**
   * Get unread notification count
   */
  getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const count = await getUnreadNotificationCount(ctx.user.id);
    return { count };
  }),

  /**
   * Mark notification as read
   */
  markAsRead: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        await markNotificationAsRead(input.notificationId);
        return { success: true };
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to mark notification as read",
        });
      }
    }),

  /**
   * Dismiss notification
   */
  dismiss: protectedProcedure
    .input(z.object({ notificationId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        await dismissNotification(input.notificationId);
        return { success: true };
      } catch (error) {
        console.error("Failed to dismiss notification:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to dismiss notification",
        });
      }
    }),

  /**
   * Get notification preferences
   */
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const prefs = await getOrCreateNotificationPreferences(ctx.user.id);
    return prefs || null;
  }),

  /**
   * Update notification preferences
   */
  updatePreferences: protectedProcedure
    .input(
      z.object({
        emailEnabled: z.boolean().optional(),
        pushEnabled: z.boolean().optional(),
        inAppEnabled: z.boolean().optional(),
        emailFrequency: z
          .enum(["immediate", "daily", "weekly", "never"])
          .optional(),
        quietHoursStart: z.string().optional(),
        quietHoursEnd: z.string().optional(),
        categoryPreferences: z.record(z.string(), z.boolean()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const updates: Record<string, unknown> = {};

        if (input.emailEnabled !== undefined) {
          updates.emailEnabled = input.emailEnabled;
        }
        if (input.pushEnabled !== undefined) {
          updates.pushEnabled = input.pushEnabled;
        }
        if (input.inAppEnabled !== undefined) {
          updates.inAppEnabled = input.inAppEnabled;
        }
        if (input.emailFrequency !== undefined) {
          updates.emailFrequency = input.emailFrequency;
        }
        if (input.quietHoursStart !== undefined) {
          updates.quietHoursStart = input.quietHoursStart;
        }
        if (input.quietHoursEnd !== undefined) {
          updates.quietHoursEnd = input.quietHoursEnd;
        }
        if (input.categoryPreferences !== undefined) {
          updates.categoryPreferences = JSON.stringify(input.categoryPreferences);
        }

        await updateNotificationPreferences(ctx.user.id, updates);
        return { success: true };
      } catch (error) {
        console.error("Failed to update preferences:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update preferences",
        });
      }
    }),

  /**
   * Register push subscription
   */
  registerPushSubscription: protectedProcedure
    .input(
      z.object({
        endpoint: z.string().url(),
        auth: z.string(),
        p256dh: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const subscription = await savePushSubscription({
          userId: ctx.user.id,
          endpoint: input.endpoint,
          auth: input.auth,
          p256dh: input.p256dh,
          userAgent: ctx.req.headers["user-agent"],
        });

        return { success: true, subscription };
      } catch (error) {
        console.error("Failed to register push subscription:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to register push subscription",
        });
      }
    }),

  /**
   * Get user's push subscriptions
   */
  getPushSubscriptions: protectedProcedure.query(async ({ ctx }) => {
    if (!ctx.user?.id) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }

    const subscriptions = await getUserPushSubscriptions(ctx.user.id);
    return subscriptions;
  }),

  /**
   * Admin: Create and send notification to user(s)
   */
  sendNotification: adminProcedure
    .input(
      z.object({
        userId: z.number().int().positive().optional(), // If not provided, send to all users
        title: z.string().min(1).max(255),
        message: z.string().min(1),
        type: z.enum(["success", "error", "warning", "info"]).default("info"),
        category: z.string().min(1).max(64),
        channels: z.array(z.enum(["in-app", "email", "push"])).default(["in-app"]),
        displayLocation: z
          .enum(["toast", "banner", "center"])
          .default("toast"),
        duration: z.number().int().positive().optional(),
        actionUrl: z.string().url().optional(),
        actionLabel: z.string().max(64).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const notification = await createNotification({
          userId: input.userId || null,
          title: input.title,
          message: input.message,
          type: input.type,
          category: input.category,
          source: "admin",
          channels: JSON.stringify(input.channels),
          displayLocation: input.displayLocation,
          duration: input.duration,
          actionUrl: input.actionUrl,
          actionLabel: input.actionLabel,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        });

        // If email channel is included, queue the email
        if (input.channels.includes("email") && input.userId) {
          const emailSubject = `${input.title} - OpenOSINT`;
          const emailBody = `<p>${input.message}</p>`;

          if (notification?.id) {
            await queueEmail({
              notificationId: notification.id,
              recipientEmail: "", // This should be fetched from user table
              subject: emailSubject,
              htmlBody: emailBody,
            });
          }
        }

        return {
          success: true,
          notification,
        };
      } catch (error) {
        console.error("Failed to send notification:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send notification",
        });
      }
    }),

  /**
   * Admin: Broadcast notification to all users
   */
  broadcastNotification: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        message: z.string().min(1),
        type: z.enum(["success", "error", "warning", "info"]).default("info"),
        category: z.string().min(1).max(64),
        channels: z.array(z.enum(["in-app", "email", "push"])).default(["in-app"]),
        displayLocation: z
          .enum(["toast", "banner", "center"])
          .default("banner"),
        actionUrl: z.string().url().optional(),
        actionLabel: z.string().max(64).optional(),
      })
    )
    .mutation(async ({ input }) => {
      try {
        const notification = await createNotification({
          userId: null, // Broadcast to all
          title: input.title,
          message: input.message,
          type: input.type,
          category: input.category,
          source: "admin",
          channels: JSON.stringify(input.channels),
          displayLocation: input.displayLocation,
          actionUrl: input.actionUrl,
          actionLabel: input.actionLabel,
        });

        return {
          success: true,
          notification,
        };
      } catch (error) {
        console.error("Failed to broadcast notification:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to broadcast notification",
        });
      }
    }),
});

export type NotificationRouter = typeof notificationRouter;
