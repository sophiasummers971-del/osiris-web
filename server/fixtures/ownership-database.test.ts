import { afterEach, expect, it, vi } from "vitest";
import { createOwnershipDatabase } from "./ownership-database";

afterEach(() => vi.unstubAllEnvs());
it.each([
  ["5432", "false", "Native ownership tests require the isolated CI service"],
  [
    "postgresql://production.invalid/database",
    "true",
    "Native ownership tests require the isolated CI service",
  ],
  ["65536", "true", "Invalid isolated PostgreSQL test port"],
])(
  "refuses unsafe native database selection %s before connecting",
  async (port, actions, message) => {
    vi.stubEnv("OSIRIS_TEST_POSTGRES_PORT", port);
    vi.stubEnv("GITHUB_ACTIONS", actions);
    vi.stubEnv("CI", "true");
    await expect(createOwnershipDatabase()).rejects.toThrow(message);
  }
);
