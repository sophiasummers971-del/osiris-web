import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users } from "../drizzle/schema.js";
import { ENV } from "./_core/env.js";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// TODO: add feature queries here as your schema grows.

import {
  notifications,
  notificationPreferences,
  pushSubscriptions,
  emailQueue,
  InsertNotification,
  InsertNotificationPreference,
  InsertPushSubscription,
  InsertEmailQueue,
  Notification,
  NotificationPreference,
  PushSubscription,
  EmailQueue,
} from "../drizzle/schema.js";
import { desc, and, gt } from "drizzle-orm";

/**
 * Create a new notification
 */
export async function createNotification(
  data: InsertNotification
): Promise<Notification | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot create notification: database not available"
    );
    return undefined;
  }

  try {
    const result = await db.insert(notifications).values(data);
    const id = result[0].insertId;
    const created = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, Number(id)))
      .limit(1);
    return created[0];
  } catch (error) {
    console.error("[Database] Failed to create notification:", error);
    throw error;
  }
}

/**
 * Get notifications for a user (with pagination)
 */
export async function getUserNotifications(
  userId: number,
  limit: number = 20,
  offset: number = 0
) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get notifications: database not available");
    return [];
  }

  try {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
  } catch (error) {
    console.error("[Database] Failed to get notifications:", error);
    return [];
  }
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadNotificationCount(
  userId: number
): Promise<number> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get unread count: database not available");
    return 0;
  }

  try {
    const result = await db
      .select({ count: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.inAppStatus, "pending")
        )
      );
    return result.length > 0 ? result.length : 0;
  } catch (error) {
    console.error("[Database] Failed to get unread count:", error);
    return 0;
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  notificationId: number
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot mark notification: database not available");
    return;
  }

  try {
    await db
      .update(notifications)
      .set({
        inAppStatus: "read",
        readAt: new Date(),
      })
      .where(eq(notifications.id, notificationId));
  } catch (error) {
    console.error("[Database] Failed to mark notification as read:", error);
    throw error;
  }
}

/**
 * Dismiss notification
 */
export async function dismissNotification(
  notificationId: number
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot dismiss notification: database not available"
    );
    return;
  }

  try {
    await db
      .update(notifications)
      .set({
        inAppStatus: "dismissed",
        dismissedAt: new Date(),
      })
      .where(eq(notifications.id, notificationId));
  } catch (error) {
    console.error("[Database] Failed to dismiss notification:", error);
    throw error;
  }
}

/**
 * Get or create user notification preferences
 */
export async function getOrCreateNotificationPreferences(
  userId: number
): Promise<NotificationPreference | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get preferences: database not available");
    return undefined;
  }

  try {
    let prefs = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId))
      .limit(1);

    if (prefs.length === 0) {
      // Create default preferences
      await db.insert(notificationPreferences).values({
        userId,
        emailEnabled: true,
        pushEnabled: true,
        inAppEnabled: true,
        categoryPreferences: "{}",
        emailFrequency: "daily",
      });

      prefs = await db
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId))
        .limit(1);
    }

    return prefs[0];
  } catch (error) {
    console.error("[Database] Failed to get notification preferences:", error);
    return undefined;
  }
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  userId: number,
  updates: Partial<InsertNotificationPreference>
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot update preferences: database not available"
    );
    return;
  }

  try {
    await db
      .update(notificationPreferences)
      .set(updates)
      .where(eq(notificationPreferences.userId, userId));
  } catch (error) {
    console.error(
      "[Database] Failed to update notification preferences:",
      error
    );
    throw error;
  }
}

/**
 * Save push subscription
 */
export async function savePushSubscription(
  data: InsertPushSubscription
): Promise<PushSubscription | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot save push subscription: database not available"
    );
    return undefined;
  }

  try {
    await db
      .insert(pushSubscriptions)
      .values(data)
      .onDuplicateKeyUpdate({
        set: {
          isActive: true,
          updatedAt: new Date(),
        },
      });

    const result = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, data.endpoint))
      .limit(1);

    return result[0];
  } catch (error) {
    console.error("[Database] Failed to save push subscription:", error);
    throw error;
  }
}

/**
 * Get user's push subscriptions
 */
export async function getUserPushSubscriptions(
  userId: number
): Promise<PushSubscription[]> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot get push subscriptions: database not available"
    );
    return [];
  }

  try {
    return await db
      .select()
      .from(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.userId, userId),
          eq(pushSubscriptions.isActive, true)
        )
      );
  } catch (error) {
    console.error("[Database] Failed to get push subscriptions:", error);
    return [];
  }
}

/**
 * Add email to queue
 */
export async function queueEmail(
  data: InsertEmailQueue
): Promise<EmailQueue | undefined> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot queue email: database not available");
    return undefined;
  }

  try {
    const result = await db.insert(emailQueue).values(data);
    const id = result[0].insertId;
    const queued = await db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.id, Number(id)))
      .limit(1);
    return queued[0];
  } catch (error) {
    console.error("[Database] Failed to queue email:", error);
    throw error;
  }
}

/**
 * Get pending emails
 */
export async function getPendingEmails(
  limit: number = 50
): Promise<EmailQueue[]> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot get pending emails: database not available"
    );
    return [];
  }

  try {
    return await db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.status, "pending"))
      .orderBy(emailQueue.createdAt)
      .limit(limit);
  } catch (error) {
    console.error("[Database] Failed to get pending emails:", error);
    return [];
  }
}

/**
 * Update email status
 */
export async function updateEmailStatus(
  emailId: number,
  status: "sent" | "failed" | "bounced",
  error?: string
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn(
      "[Database] Cannot update email status: database not available"
    );
    return;
  }

  try {
    const currentEmail = await db
      .select()
      .from(emailQueue)
      .where(eq(emailQueue.id, emailId))
      .limit(1);

    if (!currentEmail || !currentEmail[0]) return;

    await db
      .update(emailQueue)
      .set({
        status,
        error: error || null,
        sentAt: status === "sent" ? new Date() : null,
        lastAttemptAt: new Date(),
        attemptCount: (currentEmail[0].attemptCount || 0) + 1,
      })
      .where(eq(emailQueue.id, emailId));
  } catch (error) {
    console.error("[Database] Failed to update email status:", error);
    throw error;
  }
}
