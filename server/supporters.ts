import { eq, desc } from "drizzle-orm";
import { getDb } from "./db";
import { supporters, supporterTiers, exclusiveContent, supporterAccessLog, InsertSupporter, SupporterTier, ExclusiveContent } from "../drizzle/schema";

/**
 * Get all supporter tiers
 */
export async function getSupporterTiers(): Promise<SupporterTier[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(supporterTiers).where(eq(supporterTiers.active, true)).orderBy(supporterTiers.order);
}

/**
 * Get a supporter by email
 */
export async function getSupporterByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(supporters).where(eq(supporters.kofiEmail, email)).limit(1);
  return result[0];
}

/**
 * Create or update a supporter
 */
export async function upsertSupporter(data: InsertSupporter) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(supporters).values(data).onDuplicateKeyUpdate({
    set: {
      status: data.status,
      monthlyAmount: data.monthlyAmount,
      updatedAt: new Date(),
    },
  });
}

/**
 * Get all published exclusive content
 */
export async function getExclusiveContent(): Promise<ExclusiveContent[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(exclusiveContent).where(eq(exclusiveContent.published, true)).orderBy(desc(exclusiveContent.publishedAt));
}

/**
 * Get exclusive content by tier requirement
 */
export async function getContentByTier(minTier: string): Promise<ExclusiveContent[]> {
  const db = await getDb();
  if (!db) return [];
  
  // Map tier names to access levels
  const tierHierarchy: Record<string, number> = {
    coffee: 1,
    patron: 2,
    vip: 3,
  };
  
  const minLevel = tierHierarchy[minTier] || 0;
  const accessibleTiers = Object.entries(tierHierarchy)
    .filter(([_, level]) => level >= minLevel)
    .map(([tier, _]) => tier);
  
  return db.select().from(exclusiveContent)
    .where(eq(exclusiveContent.published, true))
    .orderBy(desc(exclusiveContent.publishedAt));
}

/**
 * Log content access
 */
export async function logContentAccess(supporterId: number, contentId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.insert(supporterAccessLog).values({
    supporterId,
    contentId,
  });
}

/**
 * Get supporter stats
 */
export async function getSupporterStats() {
  const db = await getDb();
  if (!db) return { totalSupporters: 0, activeSupporters: 0, monthlyRevenue: 0 };
  
  const allSupporters = await db.select().from(supporters);
  const activeSupporters = allSupporters.filter(s => s.status === 'active');
  
  const monthlyRevenue = activeSupporters.reduce((sum, s) => {
    const amount = parseFloat(s.monthlyAmount?.toString() || '0');
    return sum + amount;
  }, 0);
  
  return {
    totalSupporters: allSupporters.length,
    activeSupporters: activeSupporters.length,
    monthlyRevenue,
  };
}
