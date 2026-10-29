// Test-only PostgreSQL backends. Never imported by the Worker or Node entry point.
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle as memoryDrizzle } from "drizzle-orm/pglite";
import { drizzle as nativeDrizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import type { getVaultDb } from "../vault-db";

type VaultDb = NonNullable<ReturnType<typeof getVaultDb>>;
export type OwnershipDatabase = {
  query<T = Record<string, unknown>>(
    text: string,
    parameters?: unknown[]
  ): Promise<{ rows: T[] }>;
  exec(text: string): Promise<unknown>;
  close(): Promise<void>;
  orm: VaultDb;
  fixture(text: string): string;
};

export async function createOwnershipDatabase(): Promise<OwnershipDatabase> {
  const portValue = process.env.OSIRIS_TEST_POSTGRES_PORT;
  if (portValue === undefined) {
    const memory = await PGlite.create({ extensions: { pgcrypto } });
    return {
      query: (text, parameters) => memory.query(text, parameters),
      exec: text => memory.exec(text),
      close: () => memory.close(),
      orm: memoryDrizzle(memory) as unknown as VaultDb,
      fixture: text => text,
    };
  }
  // Only a disposable CI service on loopback, with fixed synthetic credentials.
  // No URL/host/password environment variable or production fallback is accepted.
  if (
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.CI !== "true" ||
    !/^\d+$/.test(portValue)
  )
    throw new Error("Native ownership tests require the isolated CI service");
  const port = Number(portValue);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535)
    throw new Error("Invalid isolated PostgreSQL test port");
  const options = {
    host: "127.0.0.1",
    port,
    username: "postgres",
    password: "synthetic-ownership-ci-only",
    database: "osiris_ownership_test",
    ssl: false as const,
    max: 1,
    prepare: false,
    connect_timeout: 5,
    types: {
      fixture_bigint: { to: 20, from: [20], serialize: String, parse: Number },
    },
  };
  const admin = postgres(options);
  const databaseName = `osiris_ownership_run_${randomUUID().replaceAll("-", "")}`;
  let created = false;
  let client: ReturnType<typeof postgres> | undefined;
  try {
    const [identity] = await admin`select current_database() as database,
      current_setting('server_version_num')::int as version,
      (select count(*)::int from pg_tables where schemaname='public') as tables`;
    if (
      identity.database !== options.database ||
      identity.version < 170000 ||
      identity.version >= 180000 ||
      identity.tables !== 0
    )
      throw new Error(
        "PostgreSQL service is not the empty dedicated PG17 test database"
      );
    const roles =
      await admin`select rolname,rolsuper,rolcanlogin,rolbypassrls from pg_roles
      where rolname in ('anon','authenticated','service_role','osiris_server')`;
    if (roles.length === 0) {
      await admin
        .unsafe(
          `create role anon nologin; create role authenticated nologin;
        create role service_role nologin bypassrls; create role osiris_server nologin bypassrls;`
        )
        .simple();
    } else if (
      roles.length !== 4 ||
      roles.some(
        role =>
          role.rolsuper ||
          role.rolcanlogin ||
          role.rolbypassrls !==
            ["service_role", "osiris_server"].includes(role.rolname)
      )
    ) {
      throw new Error("Unexpected roles in isolated PostgreSQL service");
    }
    // Only freshly generated names are created/dropped. Existing databases are untouched.
    await admin.unsafe(`create database "${databaseName}"`);
    created = true;
    client = postgres({ ...options, database: databaseName });
    const sql = client;
    return {
      query: async <T>(text: string, parameters: unknown[] = []) => ({
        rows: (await sql.unsafe(
          text,
          parameters as postgres.ParameterOrJSON<never>[]
        )) as unknown as T[],
      }),
      exec: text => sql.unsafe(text).simple(),
      orm: nativeDrizzle(sql),
      // Roles are cluster-wide on native PG, unlike independent memory engines.
      fixture: text =>
        text.replace(
          /^create role (?:anon|authenticated|service_role|osiris_server) nologin(?: bypassrls)?;\n/gm,
          ""
        ),
      close: async () => {
        try {
          await sql.end({ timeout: 5 });
          await admin.unsafe(`drop database "${databaseName}"`);
        } finally {
          await admin.end({ timeout: 5 });
        }
      },
    };
  } catch (error) {
    try {
      await client?.end({ timeout: 5 });
      if (created) await admin.unsafe(`drop database "${databaseName}"`);
    } finally {
      await admin.end({ timeout: 5 });
    }
    throw error;
  }
}
