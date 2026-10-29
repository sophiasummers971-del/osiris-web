import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ensureVaultOperator, getVaultDb } from "./vault-db";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readFileSync } from "node:fs";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import catalog from "./fixtures/ownership-catalog-20261029.json";

const tables = [
  "osiris_operators",
  "security_cases",
  "evidence_records",
  "case_audit_events",
];
const repairPath = new URL(
  "../docs/security/proposals/20261029_vault_case_ownership.sql",
  import.meta.url
);
const subjectA = "00000000-0000-0000-0000-000000000001";
const subjectB = "00000000-0000-0000-0000-000000000002";
const repair = () => readFileSync(repairPath, "utf8");
let db: PGlite;

async function baseline() {
  // No connection URL, credentials or filesystem: a disposable in-memory engine.
  const pg = await PGlite.create({ extensions: { pgcrypto } });
  try {
    await pg.exec(
      readFileSync(
        new URL("./fixtures/vault-ownership.sql", import.meta.url),
        "utf8"
      )
    );
    // Exact policy expressions from the read-only production catalogue snapshot.
    for (const p of catalog.policies.filter(p =>
      tables.includes(p.tablename)
    )) {
      await pg.exec(
        `create policy ${p.policyname} on public.${p.tablename} as ${p.permissive} for ${p.cmd} to ${p.roles.join(",")}${p.qual ? ` using (${p.qual})` : ""}${p.with_check ? ` with check (${p.with_check})` : ""}`
      );
    }
    return pg;
  } catch (error) {
    await pg.close();
    throw error;
  }
}
async function as(role = "authenticated", subject = subjectA) {
  // This fixture models PostgREST's verified JWT subject, not JWT verification.
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [
    subject,
  ]);
  await db.exec(`set local role ${role}`);
}
const denied = (sql: string, code = "42501") =>
  expect(db.exec(sql)).rejects.toMatchObject({ code });
const audit = (owner = 1, caseId = 20) =>
  `insert into public.case_audit_events(id,case_id,operator_id,action) values(300,${caseId},${owner},'SYNTHETIC_ATTEMPT')`;
const evidence = (owner = 1, caseId = 20) =>
  `insert into public.evidence_records(id,case_id,owner_id,label,source_type) values(300,${caseId},${owner},'SYNTHETIC_ATTEMPT','system')`;

describe("Vault ownership enforced by PostgreSQL grants, RLS and foreign keys", () => {
  beforeAll(async () => {
    db = await baseline();
    if (process.env.OSIRIS_TEST_OWNERSHIP_BASELINE !== "1")
      await db.exec(repair());
    console.log(
      "[Ownership test engine]",
      (await db.query("select version() as version")).rows[0]
    );
  }, 30000);
  beforeEach(async () => {
    await db.exec("begin");
  });
  afterEach(async () => {
    await db.exec("rollback");
  });
  afterAll(async () => {
    await db?.close();
  });

  it("allows each authenticated owner to read only their own case and children", async () => {
    for (const [subject, id] of [
      [subjectA, 10],
      [subjectB, 20],
    ] as const) {
      await as("authenticated", subject);
      expect(
        (await db.query("select id from public.security_cases")).rows
      ).toEqual([{ id }]);
      for (const table of ["evidence_records", "case_audit_events"])
        expect(
          (await db.query(`select case_id from public.${table}`)).rows
        ).toEqual([{ case_id: id }]);
    }
  });
  it("allows own-case evidence and sealed audit appends", async () => {
    await as();
    await db.exec(evidence(1, 10));
    await db.exec(audit(1, 10));
    const result = await db.query<{
      event_hash: string;
      previous_event_hash: string;
    }>(
      "select event_hash,previous_event_hash from public.case_audit_events where id=300"
    );
    expect(result.rows[0].event_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.rows[0].previous_event_hash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("denies own-operator audit injection into another owner's case", async () => {
    await as();
    await denied(audit());
  });
  it("denies own-owner evidence injection into another owner's case", async () => {
    await as();
    await denied(evidence());
  });
  it("denies impersonating the other case owner", async () => {
    await as();
    await denied(evidence(2));
  });
  it("denies an anonymous append", async () => {
    await as("anon", "");
    await denied(audit());
  });
  it("denies an authenticated append with no verified subject", async () => {
    await as("authenticated", "");
    await denied(evidence(1, 10));
  });
  it.each(["anon", "authenticated"])(
    "exposes no rows to %s without a subject",
    async role => {
      await as(role, "");
      if (role === "anon") await denied("select * from public.security_cases");
      else
        expect(
          (await db.query("select id from public.security_cases")).rows
        ).toEqual([]);
    }
  );
  it("blocks operator identity substitution through the Data API role", async () => {
    await as();
    await denied(
      "update public.osiris_operators set external_id='supabase:synthetic-other' where id=1"
    );
  });
  it("blocks operator role escalation through the Data API role", async () => {
    await as();
    await denied("update public.osiris_operators set role='admin' where id=1");
  });
  it("reserves operator provisioning for the server", async () => {
    await as();
    await denied(
      `insert into public.osiris_operators(id,auth_user_id) values(3,'${subjectA}')`
    );
  });
  it("reserves operator deletion for the server", async () => {
    // No dependent children: prove the grant, not a foreign-key failure.
    await db.exec(
      "insert into public.osiris_operators(id,auth_user_id) values(3,'00000000-0000-0000-0000-000000000003')"
    );
    await as("authenticated", "00000000-0000-0000-0000-000000000003");
    await denied("delete from public.osiris_operators where id=3");
  });
  it.each(["evidence_records", "case_audit_events"])(
    "removes unused public-role UPDATE/DELETE grants on %s",
    async table => {
      const result = await db.query(
        "select has_table_privilege('authenticated',$1,'UPDATE') as upd,has_table_privilege('authenticated',$1,'DELETE') as del",
        [`public.${table}`]
      );
      expect(result.rows).toEqual([{ upd: false, del: false }]);
    }
  );
  it.each(["evidence_records", "case_audit_events"])(
    "keeps the append-only trigger on %s for privileged writes",
    async table => {
      await as("osiris_server");
      await expect(
        db.exec(`delete from public.${table} where id=100`)
      ).rejects.toMatchObject({ code: "P0001" });
    }
  );
  it("preserves real server operator provisioning and profile upsert", async () => {
    await as("osiris_server");
    const adapter = drizzle(db) as unknown as NonNullable<
      ReturnType<typeof getVaultDb>
    >;
    const user = {
      openId: "supabase:00000000-0000-0000-0000-000000000003",
      name: "Synthetic C",
      email: null,
      role: "user" as const,
    };
    const operator = await ensureVaultOperator(adapter, user);
    expect(operator.role).toBe("operator");
    const updated = await ensureVaultOperator(adapter, {
      ...user,
      name: "Synthetic C updated",
    });
    expect(updated.id).toBe(operator.id);
    expect(updated.displayName).toBe("Synthetic C updated");
    await db.query(
      "insert into public.security_cases(id,owner_id,title) values(30,$1,'Synthetic server case')",
      [operator.id]
    );
    await db.exec(evidence(operator.id, 30));
    await db.exec(audit(operator.id, 30));
  });
  it.each(["osiris_server", "service_role"])(
    "prevents mismatched evidence ownership even when %s bypasses RLS",
    async role => {
      await as(role);
      await denied(evidence(), "23503");
    }
  );
  it.each(["osiris_server", "service_role"])(
    "prevents mismatched audit ownership even when %s bypasses RLS",
    async role => {
      await as(role);
      await denied(audit(), "23503");
    }
  );
  it("prevents a case owner change from orphaning ownership-bound evidence", async () => {
    await as("osiris_server");
    await denied(
      "update public.security_cases set owner_id=2 where id=10",
      "23503"
    );
  });
  it("preserves existing authenticated own-case creation and updates", async () => {
    await as();
    await db.exec(
      "insert into public.security_cases(id,owner_id,title) values(30,1,'Synthetic new')"
    );
    expect(
      (
        await db.query(
          "update public.security_cases set title='Synthetic updated' where id=30 returning title"
        )
      ).rows
    ).toEqual([{ title: "Synthetic updated" }]);
  });
  it.each(["evidence", "audit"])(
    "rolls back the whole proposal if existing %s has conflicting ownership",
    async kind => {
      const pg = await baseline();
      try {
        await pg.exec(kind === "evidence" ? evidence() : audit()); // Old structural gap.
        await expect(pg.exec(repair())).rejects.toMatchObject({
          code: "23503",
        });
        await pg.exec("rollback");
        expect(
          (
            await pg.query(
              "select has_table_privilege('authenticated','public.osiris_operators','UPDATE') as allowed"
            )
          ).rows
        ).toEqual([{ allowed: true }]);
        expect(
          (
            await pg.query(
              `select count(*)::int as n from public.${kind === "evidence" ? "evidence_records" : "case_audit_events"} where id=300`
            )
          ).rows
        ).toEqual([{ n: 1 }]);
      } finally {
        await pg.close();
      }
    },
    30000
  );
});
