import { describe, expect, it } from "vitest";
import handler from "./worker.js";

const env = { PEGASUS_STAGING_ONLY: "true" };
const request = (path: string, method = "GET") =>
  new Request("https://staging.example.test" + path, { method });

describe("Pegasus sealed staging observer", () => {
  it("reports healthy synthetic state", async () => {
    const res = await handler.fetch(request("/health"), env);
    expect(res.status).toBe(200);
    expect((await res.json()).mode).toBe("synthetic");
  });
  it("shows both Sector 7 ports sealed", async () => {
    const res = await handler.fetch(request("/routes"), env);
    const body = await res.json();
    expect(body.pipelines["sector7-a"]).toBe("sealed");
    expect(body.pipelines["sector7-b"]).toBe("sealed");
    expect(body.appliesRoutingChanges).toBe(false);
  });
  it("denies all routing mutations", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await handler.fetch(request("/routes", method), env);
      expect(res.status).toBe(405);
    }
  });
  it("fails closed without staging seal", async () => {
    const res = await handler.fetch(request("/routes"), {
      PEGASUS_STAGING_ONLY: "false",
    });
    expect(res.status).toBe(503);
  });
  it("does not expose other routes", async () => {
    expect((await handler.fetch(request("/api/trpc"), env)).status).toBe(404);
  });
});
