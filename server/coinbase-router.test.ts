import { describe, expect, it } from "vitest";
import { appRouter } from "./routers.js";

describe("coinbase router", () => {
  it("rejects treasury reads without an authenticated user", async () => {
    const caller = appRouter.createCaller({
      req: {} as never,
      res: {} as never,
      user: null,
    });

    await expect((caller as any).coinbase.treasury()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});
