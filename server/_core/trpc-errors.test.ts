import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { protectedProcedure, publicProcedure, router } from "./trpc.js";
import type { TrpcContext } from "./context.js";

const testRouter = router({
  private: protectedProcedure.query(() => "private"),
  broken: publicProcedure.query(() => {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "database password=private-test-marker",
    });
  }),
});

describe("HTTP error response security", () => {
  it.each([
    ["private", 401, "UNAUTHORIZED"],
    ["broken", 500, "INTERNAL_SERVER_ERROR"],
  ])("sanitizes %s without changing its status", async (path, status, code) => {
    const response = await fetchRequestHandler({
      endpoint: "/api/trpc",
      req: new Request(`https://osiris.test/api/trpc/${path}`),
      router: testRouter,
      createContext: async () => ({ user: null }) as TrpcContext,
    });
    const body = await response.text();
    const data = JSON.parse(body).error.json;
    expect(response.status).toBe(status);
    expect(data.data.code).toBe(code);
    expect(data.data).not.toHaveProperty("stack");
    expect(body).not.toContain("private-test-marker");
    if (status === 500) expect(data.message).toBe("Internal server error");
  });
});
