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
  it("requires auth for createDraft", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(
      caller.createDraft({ studyId: crypto.randomUUID() })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);
  });

  it("requires auth for saveDraft", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(
      caller.saveDraft({ draftId: crypto.randomUUID() })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);
  });

  it("requires auth for submitRequest", async () => {
    const caller = appRouter.createCaller(unauthenticatedContext);

    await expect(
      caller.submitRequest({
        draftId: crypto.randomUUID(),
        idempotencyKey: "unauthenticated-submit"
      })
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED"
    } satisfies Partial<TRPCError>);
  });
});
