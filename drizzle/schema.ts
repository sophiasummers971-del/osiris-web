import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal, boolean } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Supporter tiers table - tracks Ko-Fi supporters
 */
export const supporterTiers = mysqlTable("supporter_tiers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(), // "coffee", "patron", "vip"
  displayName: varchar("displayName", { length: 128 }).notNull(), // "Coffee Supporter", "Creator Patron", "VIP Creator"
  monthlyPrice: decimal("monthlyPrice", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  features: text("features"), // JSON array of features
  order: int("order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SupporterTier = typeof supporterTiers.$inferSelect;
export type InsertSupporterTier = typeof supporterTiers.$inferInsert;

/**
 * Supporters table - tracks Ko-Fi supporters and their tier
 */
export const supporters = mysqlTable("supporters", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  kofiEmail: varchar("kofiEmail", { length: 320 }).notNull().unique(),
  tierId: int("tierId").notNull(),
  tierName: varchar("tierName", { length: 64 }).notNull(), // denormalized for quick access
  kofiId: varchar("kofiId", { length: 255 }), // Ko-Fi transaction ID
  status: mysqlEnum("status", ["active", "paused", "cancelled"]).notNull().default("active"),
  monthlyAmount: decimal("monthlyAmount", { precision: 10, scale: 2 }),
  subscribedAt: timestamp("subscribedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Supporter = typeof supporters.$inferSelect;
export type InsertSupporter = typeof supporters.$inferInsert;

/**
 * Exclusive content table - tracks early access content for supporters
 */
export const exclusiveContent = mysqlTable("exclusive_content", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  content: text("content"), // Markdown content
  type: mysqlEnum("type", ["video", "tutorial", "article", "resource", "tool"]).notNull(),
  minTierRequired: varchar("minTierRequired", { length: 64 }).notNull(), // "coffee", "patron", "vip"
  published: boolean("published").notNull().default(false),
  publishedAt: timestamp("publishedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ExclusiveContent = typeof exclusiveContent.$inferSelect;
export type InsertExclusiveContent = typeof exclusiveContent.$inferInsert;

/**
 * Supporter access log - tracks what content supporters have accessed
 */
export const supporterAccessLog = mysqlTable("supporter_access_log", {
  id: int("id").autoincrement().primaryKey(),
  supporterId: int("supporterId").notNull(),
  contentId: int("contentId").notNull(),
  accessedAt: timestamp("accessedAt").defaultNow().notNull(),
});

export type SupporterAccessLog = typeof supporterAccessLog.$inferSelect;
export type InsertSupporterAccessLog = typeof supporterAccessLog.$inferInsert;

/**
 * Contact form submissions
 */
export const contactSubmissions = mysqlTable("contact_submissions", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["new", "read", "responded"]).notNull().default("new"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ContactSubmission = typeof contactSubmissions.$inferSelect;
export type InsertContactSubmission = typeof contactSubmissions.$inferInsert;

/**
 * Tool usage log - tracks which tools are being used
 */
export const toolUsageLog = mysqlTable("tool_usage_log", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  toolName: varchar("toolName", { length: 128 }).notNull(),
  query: text("query"),
  resultSummary: text("resultSummary"),
  executionTimeMs: int("executionTimeMs"),
  success: boolean("success").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ToolUsageLog = typeof toolUsageLog.$inferSelect;
export type InsertToolUsageLog = typeof toolUsageLog.$inferInsert;


/**
 * Notifications table - stores all notifications for users
 * Supports multiple channels: in-app, email, push
 */
export const notifications = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // null for system-wide notifications
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message").notNull(),
  type: mysqlEnum("type", ["success", "error", "warning", "info"]).notNull().default("info"),
  category: varchar("category", { length: 64 }).notNull(), // "supporter", "system", "content", "admin", etc.
  source: mysqlEnum("source", ["system", "admin", "user", "realtime"]).notNull().default("system"),
  
  // Channels this notification should be sent through
  channels: varchar("channels", { length: 255 }).notNull().default("in-app"), // JSON array: ["in-app", "email", "push"]
  
  // Status tracking per channel
  inAppStatus: mysqlEnum("inAppStatus", ["pending", "sent", "read", "dismissed"]).notNull().default("pending"),
  emailStatus: mysqlEnum("emailStatus", ["pending", "sent", "failed", "skipped"]).notNull().default("skipped"),
  pushStatus: mysqlEnum("pushStatus", ["pending", "sent", "failed", "skipped"]).notNull().default("skipped"),
  
  // Display options
  displayLocation: varchar("displayLocation", { length: 64 }).notNull().default("toast"), // "toast", "banner", "center"
  duration: int("duration"), // milliseconds for toast (null = persistent)
  actionUrl: varchar("actionUrl", { length: 512 }), // CTA link
  actionLabel: varchar("actionLabel", { length: 64 }), // CTA button text
  
  // Metadata
  metadata: text("metadata"), // JSON object for extra data
  
  // Timestamps
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
  readAt: timestamp("readAt"),
  dismissedAt: timestamp("dismissedAt"),
  expiresAt: timestamp("expiresAt"), // Auto-cleanup after this date
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

/**
 * User notification preferences - tracks user's notification settings
 */
export const notificationPreferences = mysqlTable("notification_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  
  // Channel preferences
  emailEnabled: boolean("emailEnabled").notNull().default(true),
  pushEnabled: boolean("pushEnabled").notNull().default(true),
  inAppEnabled: boolean("inAppEnabled").notNull().default(true),
  
  // Category preferences (JSON object: { "supporter": true, "content": false, ... })
  categoryPreferences: text("categoryPreferences").notNull().default("{}"),
  
  // Frequency preferences
  emailFrequency: mysqlEnum("emailFrequency", ["immediate", "daily", "weekly", "never"]).notNull().default("daily"),
  
  // Quiet hours (HH:MM format)
  quietHoursStart: varchar("quietHoursStart", { length: 5 }), // "22:00"
  quietHoursEnd: varchar("quietHoursEnd", { length: 5 }), // "08:00"
  
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreference = typeof notificationPreferences.$inferInsert;

/**
 * Push subscriptions - stores browser push notification subscriptions
 */
export const pushSubscriptions = mysqlTable("push_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  endpoint: varchar("endpoint", { length: 512 }).notNull().unique(),
  auth: varchar("auth", { length: 255 }).notNull(),
  p256dh: varchar("p256dh", { length: 255 }).notNull(),
  userAgent: text("userAgent"),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

/**
 * Email queue - tracks emails to be sent
 */
export const emailQueue = mysqlTable("email_queue", {
  id: int("id").autoincrement().primaryKey(),
  notificationId: int("notificationId").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  subject: varchar("subject", { length: 255 }).notNull(),
  htmlBody: text("htmlBody").notNull(),
  status: mysqlEnum("status", ["pending", "sent", "failed", "bounced"]).notNull().default("pending"),
  attemptCount: int("attemptCount").notNull().default(0),
  lastAttemptAt: timestamp("lastAttemptAt"),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  sentAt: timestamp("sentAt"),
});

export type EmailQueue = typeof emailQueue.$inferSelect;
export type InsertEmailQueue = typeof emailQueue.$inferInsert;
