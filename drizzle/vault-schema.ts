import {
  bigint,
  bigserial,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const osirisOperators = pgTable("osiris_operators", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  externalId: text("external_id").unique(),
  authUserId: uuid("auth_user_id").unique(),
  displayName: text("display_name"),
  email: text("email"),
  role: text("role").notNull().default("operator"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const vaultSecurityCases = pgTable("security_cases", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ownerId: bigint("owner_id", { mode: "number" }).notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  severity: text("severity")
    .$type<"low" | "medium" | "high" | "critical">()
    .notNull()
    .default("medium"),
  status: text("status")
    .$type<"open" | "monitoring" | "contained" | "closed">()
    .notNull()
    .default("open"),
  confidence: integer("confidence").notNull().default(50),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const vaultEvidenceRecords = pgTable("evidence_records", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  caseId: bigint("case_id", { mode: "number" }).notNull(),
  ownerId: bigint("owner_id", { mode: "number" }).notNull(),
  label: text("label").notNull(),
  sourceType: text("source_type")
    .$type<"observation" | "document" | "message" | "system" | "external">()
    .notNull(),
  sourceReference: text("source_reference"),
  contentHash: text("content_hash"),
  notes: text("notes"),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
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
  details: jsonb("details")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  previousEventHash: text("previous_event_hash"),
  eventHash: text("event_hash").unique(),
});

/** PEGASUS records observations; it does not claim they are confirmed threats. */
export const pegasusSecurityEvents = pgTable("pegasus_security_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ownerId: bigint("owner_id", { mode: "number" }).notNull(),
  source: text("source").notNull(),
  category: text("category")
    .$type<"authentication" | "configuration" | "integration" | "system">()
    .notNull(),
  signal: text("signal").notNull(),
  severity: text("severity")
    .$type<"info" | "low" | "medium" | "high" | "critical">()
    .notNull(),
  confidence: integer("confidence").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  details: jsonb("details")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  sourceEventKey: text("source_event_key"),
  previousEventHash: text("previous_event_hash"),
  eventHash: text("event_hash").notNull().unique(),
});

/** Database-maintained chain head used to detect tail truncation. */
export const pegasusChainHeads = pgTable("pegasus_chain_heads", {
  ownerId: bigint("owner_id", { mode: "number" }).primaryKey(),
  eventCount: bigint("event_count", { mode: "number" }).notNull(),
  lastEventHash: text("last_event_hash").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const pegasusAlerts = pgTable("pegasus_alerts", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  ownerId: bigint("owner_id", { mode: "number" }).notNull(),
  eventId: bigint("event_id", { mode: "number" }).notNull(),
  ruleId: text("rule_id").notNull(),
  title: text("title").notNull(),
  severity: text("severity")
    .$type<"low" | "medium" | "high" | "critical">()
    .notNull(),
  requiresApproval: boolean("requires_approval").notNull().default(true),
  status: text("status")
    .$type<"open" | "acknowledged" | "dismissed" | "resolved">()
    .notNull()
    .default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

/** Server-managed OAuth connection metadata. Token fields contain ciphertext only. */
export const monitoringConnections = pgTable(
  "monitoring_connections",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    provider: text("provider").$type<"github">().notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    displayName: text("display_name"),
    status: text("status")
      .$type<"active" | "reauthorization_required" | "disconnected">()
      .notNull()
      .default("active"),
    scopes: text("scopes").array().notNull().default([]),
    encryptedAccessToken: text("encrypted_access_token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    checkpoint: jsonb("checkpoint")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex("monitoring_connections_provider_account_idx").on(
      table.ownerId,
      table.provider,
      table.providerAccountId
    ),
  ]
);

/** One bounded collector execution. Errors are sanitized before persistence. */
export const monitoringRuns = pgTable("monitoring_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  connectionId: bigint("connection_id", { mode: "number" }).notNull(),
  ownerId: bigint("owner_id", { mode: "number" }).notNull(),
  status: text("status")
    .$type<"running" | "succeeded" | "failed">()
    .notNull()
    .default("running"),
  checkpointBefore: jsonb("checkpoint_before")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  checkpointAfter: jsonb("checkpoint_after")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  observationCount: integer("observation_count").notNull().default(0),
  errorCode: text("error_code"),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

/** Deduplicated provider facts awaiting or linked to an append-only PEGASUS event. */
export const monitoringObservations = pgTable(
  "monitoring_observations",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    connectionId: bigint("connection_id", { mode: "number" }).notNull(),
    ownerId: bigint("owner_id", { mode: "number" }).notNull(),
    runId: uuid("run_id").notNull(),
    externalId: text("external_id").notNull(),
    kind: text("kind").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    pegasusEventId: bigint("pegasus_event_id", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  table => [
    uniqueIndex("monitoring_observations_external_idx").on(
      table.connectionId,
      table.externalId
    ),
  ]
);
