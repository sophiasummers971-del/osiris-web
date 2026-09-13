import { describe, expect, it } from "vitest";
import { assemblePosture, evaluateStaticPosture } from "./posture.js";

const configured = {
  VITE_SUPABASE_URL: "https://project.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  VERCEL_OIDC_TOKEN: "signed-oidc-token",
};

describe("evaluateStaticPosture", () => {
  it("recognizes the production architecture", () => {
    const controls = evaluateStaticPosture(configured, true);

    expect(controls.find(control => control.id === "identity")?.ready).toBe(
      true
    );
    expect(controls.find(control => control.id === "session")?.ready).toBe(
      true
    );
    expect(controls.find(control => control.id === "intelligence")?.ready).toBe(
      true
    );
  });

  it("does not disclose secret values", () => {
    const serialized = JSON.stringify(evaluateStaticPosture(configured, true));

    expect(serialized).not.toContain("signed-oidc-token");
  });
});

describe("assemblePosture", () => {
  it("marks the posture ready when every critical control is ready", () => {
    const result = assemblePosture({
      controls: evaluateStaticPosture(configured, true),
      database: { ready: true },
      isProduction: true,
      checkedAt: new Date("2026-08-03T16:00:00Z"),
    });

    expect(result.status).toBe("READY");
    expect(
      result.controls.find(control => control.id === "database")
    ).toMatchObject({
      ready: true,
      reason: undefined,
    });
  });

  it("keeps non-critical controls from degrading critical readiness", () => {
    const result = assemblePosture({
      controls: evaluateStaticPosture(
        {
          VITE_SUPABASE_URL: configured.VITE_SUPABASE_URL,
          VITE_SUPABASE_PUBLISHABLE_KEY:
            configured.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        true
      ),
      database: { ready: true },
      isProduction: true,
      checkedAt: new Date("2026-08-03T16:00:00Z"),
    });

    expect(result.status).toBe("READY");
  });
});
