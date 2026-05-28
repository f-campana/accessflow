import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import { appRouter } from "./router";
import type { RequestContext } from "./context";

const unauthenticatedContext = {
  actor: null,
  requestId: "test-request",
  req: {},
  res: {}
} as RequestContext;

describe("tRPC auth boundary", () => {
  it.each(["createDraft", "saveDraft", "submitRequest"] as const)(
    "requires auth for %s",
    async (procedure) => {
      const caller = appRouter.createCaller(unauthenticatedContext);

      await expect(caller[procedure]({})).rejects.toMatchObject({
        code: "UNAUTHORIZED"
      } satisfies Partial<TRPCError>);
    }
  );
});
