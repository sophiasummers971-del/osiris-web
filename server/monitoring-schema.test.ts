import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../drizzle/migrations/0005_github_monitoring_foundation.sql",
    import.meta.url
  )
);
const migration = readFileSync(migrationPath, "utf8");

describe("GitHub monitoring migration", () => {
  it("creates the minimum durable monitoring records", () => {
    expect(migration).toContain("public.monitoring_connections");
    expect(migration).toContain("public.monitoring_runs");
    expect(migration).toContain("public.monitoring_observations");
  });

  it("deduplicates provider observations before PEGASUS recording", () => {
    expect(migration).toMatch(/unique \(connection_id, external_id\)/);
    expect(migration).toContain("pegasus_event_id");
    expect(migration).toContain("where pegasus_event_id is null");
    expect(migration).toContain("pegasus_events_owner_source_key_idx");
  });

  it("keeps connection secrets away from browser-accessible database roles", () => {
    for (const table of [
      "monitoring_connections",
      "monitoring_runs",
      "monitoring_observations",
    ]) {
      expect(migration).toContain(
        `alter table public.${table} enable row level security`
      );
      expect(migration).toContain(
        `revoke all on table public.${table} from anon, authenticated`
      );
    }
    expect(migration).not.toMatch(/create policy .*monitoring_/i);
  });

  it("stores only explicitly encrypted OAuth token fields", () => {
    expect(migration).toContain("encrypted_access_token text");
    expect(migration).toContain("encrypted_refresh_token text");
    expect(migration).not.toMatch(/\n\s+access_token\s+text/i);
    expect(migration).not.toMatch(/\n\s+refresh_token\s+text/i);
  });
});
