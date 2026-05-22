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