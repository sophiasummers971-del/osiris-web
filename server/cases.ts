import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  vaultCaseAuditEvents,
  vaultEvidenceRecords,
  vaultSecurityCases,
} from "../drizzle/vault-schema.js";
import { ensureVaultOperator, getVaultDb } from "./vault-db.js";
import { protectedProcedure, router } from "./_core/trpc.js";

async function requireDb() {
  const db = getVaultDb();
  if (!db)
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Supabase Vault is not configured",
    });
  return db;
}

async function requireOwnedCase(
  caseId: number,
  user: Parameters<typeof ensureVaultOperator>[1]
) {
  const db = await requireDb();
  const operator = await ensureVaultOperator(db, user);
  const rows = await db
    .select()
    .from(vaultSecurityCases)
    .where(
      and(
        eq(vaultSecurityCases.id, caseId),
        eq(vaultSecurityCases.ownerId, operator.id)
      )
    )
    .limit(1);
  if (!rows[0])
    throw new TRPCError({ code: "NOT_FOUND", message: "Case not found" });
  return { db, operator, securityCase: rows[0] };
}

export const casesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const operator = await ensureVaultOperator(db, ctx.user);
    return db
      .select()
      .from(vaultSecurityCases)
      .where(eq(vaultSecurityCases.ownerId, operator.id))
      .orderBy(desc(vaultSecurityCases.updatedAt));
  }),

  create: protectedProcedure
    .input(
      z.object({
        title: z.string().trim().min(3).max(255),
        summary: z.string().trim().max(5000).optional(),
        severity: z
          .enum(["low", "medium", "high", "critical"])
          .default("medium"),
        confidence: z.number().int().min(0).max(100).default(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const operator = await ensureVaultOperator(db, ctx.user);
      return db.transaction(async tx => {
        const [created] = await tx
          .insert(vaultSecurityCases)
          .values({ ...input, ownerId: operator.id })
          .returning({ id: vaultSecurityCases.id });
        if (!created)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Case creation failed",
          });
        await tx.insert(vaultCaseAuditEvents).values({
          caseId: created.id,
          operatorId: operator.id,
          action: "CASE_CREATED",
          details: { severity: input.severity, confidence: input.confidence },
        });
        return { id: created.id };
      });
    }),

  detail: protectedProcedure
    .input(z.object({ caseId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const { db, operator, securityCase } = await requireOwnedCase(
        input.caseId,
        ctx.user
      );
      const [evidence, audit] = await Promise.all([
        db
          .select()
          .from(vaultEvidenceRecords)
          .where(
            and(
              eq(vaultEvidenceRecords.caseId, input.caseId),
              eq(vaultEvidenceRecords.ownerId, operator.id)
            )
          )
          .orderBy(desc(vaultEvidenceRecords.capturedAt)),
        db
          .select()
          .from(vaultCaseAuditEvents)
          .where(eq(vaultCaseAuditEvents.caseId, input.caseId))
          .orderBy(desc(vaultCaseAuditEvents.createdAt)),
      ]);
      return { case: securityCase, evidence, audit };
    }),

  addEvidence: protectedProcedure
    .input(
      z.object({
        caseId: z.number().int().positive(),
        label: z.string().trim().min(2).max(255),
        sourceType: z.enum([
          "observation",
          "document",
          "message",
          "system",
          "external",
        ]),
        sourceReference: z.string().trim().max(5000).optional(),
        contentHash: z
          .string()
          .trim()
          .regex(/^[0-9a-f]{64}$/, "Use a lowercase SHA-256 hash")
          .optional(),
        notes: z.string().trim().max(10000).optional(),
        capturedAt: z.date(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { db, operator } = await requireOwnedCase(input.caseId, ctx.user);
      return db.transaction(async tx => {
        const [created] = await tx
          .insert(vaultEvidenceRecords)
          .values({ ...input, ownerId: operator.id })
          .returning({ id: vaultEvidenceRecords.id });
        if (!created)
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Evidence creation failed",
          });
        await tx.insert(vaultCaseAuditEvents).values({
          caseId: input.caseId,
          operatorId: operator.id,
          action: "EVIDENCE_ADDED",
          details: {
            evidenceId: created.id,
            label: input.label,
            sourceType: input.sourceType,
          },
        });
        return { id: created.id };
      });
    }),
});
