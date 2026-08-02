import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { caseAuditEvents, evidenceRecords, securityCases } from "../drizzle/schema";
import { getDb } from "./db";
import { protectedProcedure, router } from "./_core/trpc";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Operational database is not configured" });
  return db;
}

async function requireOwnedCase(caseId: number, userId: number) {
  const db = await requireDb();
  const rows = await db.select().from(securityCases).where(and(eq(securityCases.id, caseId), eq(securityCases.userId, userId))).limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
  return { db, securityCase: rows[0] };
}

export const casesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(securityCases).where(eq(securityCases.userId, ctx.user.id)).orderBy(desc(securityCases.updatedAt));
  }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().trim().min(3).max(255),
      summary: z.string().trim().max(5000).optional(),
      severity: z.enum(["low", "medium", "high", "critical"]).default("medium"),
      confidence: z.number().int().min(0).max(100).default(50),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const result = await db.insert(securityCases).values({ ...input, userId: ctx.user.id });
      const caseId = Number(result[0].insertId);
      await db.insert(caseAuditEvents).values({ caseId, userId: ctx.user.id, action: "CASE_CREATED", details: JSON.stringify({ severity: input.severity, confidence: input.confidence }) });
      return { id: caseId };
    }),

  detail: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { db, securityCase } = await requireOwnedCase(input.caseId, ctx.user.id);
      const [evidence, audit] = await Promise.all([
        db.select().from(evidenceRecords).where(and(eq(evidenceRecords.caseId, input.caseId), eq(evidenceRecords.userId, ctx.user.id))).orderBy(desc(evidenceRecords.capturedAt)),
        db.select().from(caseAuditEvents).where(and(eq(caseAuditEvents.caseId, input.caseId), eq(caseAuditEvents.userId, ctx.user.id))).orderBy(desc(caseAuditEvents.createdAt)),
      ]);
      return { case: securityCase, evidence, audit };
    }),

  addEvidence: protectedProcedure
    .input(z.object({
      caseId: z.number().int().positive(),
      label: z.string().trim().min(2).max(255),
      sourceType: z.enum(["observation", "document", "message", "system", "external"]),
      sourceReference: z.string().trim().max(5000).optional(),
      contentHash: z.string().trim().max(128).optional(),
      notes: z.string().trim().max(10000).optional(),
      capturedAt: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { db } = await requireOwnedCase(input.caseId, ctx.user.id);
      const result = await db.insert(evidenceRecords).values({ ...input, userId: ctx.user.id });
      await db.insert(caseAuditEvents).values({ caseId: input.caseId, userId: ctx.user.id, action: "EVIDENCE_ADDED", details: JSON.stringify({ evidenceId: Number(result[0].insertId), label: input.label, sourceType: input.sourceType }) });
      return { id: Number(result[0].insertId) };
    }),
});
