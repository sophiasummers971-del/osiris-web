import { bigint, bigserial, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const osirisOperators = pgTable("osiris_operators", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  externalId: text("external_id").unique(),
  authUserId: uuid("auth_user_id").unique(),
  displayName: text("display_name"),
  email: text("email"),
  role: text("role").notNull().default("operator"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vaultSecurityCases = pgTable("security_cases", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ownerId: bigint("owner_id", { mode: "number" }).notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  severity: text("severity").$type<"low" | "medium" | "high" | "critical">().notNull().default("medium"),
  status: text("status").$type<"open" | "monitoring" | "contained" | "closed">().notNull().default("open"),
  confidence: integer("confidence").notNull().default(50),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const vaultEvidenceRecords = pgTable("evidence_records", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  caseId: bigint("case_id", { mode: "number" }).notNull(),
  ownerId: bigint("owner_id", { mode: "number" }).notNull(),
  label: text("label").notNull(),
  sourceType: text("source_type").$type<"observation" | "document" | "message" | "system" | "external">().notNull(),
  sourceReference: text("source_reference"),
  contentHash: text("content_hash"),
  notes: text("notes"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  storageBucket: text("storage_bucket"),
  storagePath: text("storage_path").unique(),
  originalFilename: text("original_filename"),
  mimeType: text("mime_type"),
  fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
});

export const vaultCaseAuditEvents = pgTable("case_audit_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  caseId: bigint("case_id", { mode: "number" }).notNull(),
  operatorId: bigint("operator_id", { mode: "number" }).notNull(),
  action: text("action").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  previousEventHash: text("previous_event_hash"),
  eventHash: text("event_hash").unique(),
});
