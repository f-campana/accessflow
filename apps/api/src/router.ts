import { toCommandResponse } from "@accessflow/core";
import { z } from "zod";

import {
  createDraft,
  saveDraft,
  submitRequest
} from "./commands/study-access";
import { authenticatedProcedure, publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true,
    service: "accessflow-api"
  })),
  createDraft: authenticatedProcedure
    .input(z.unknown())
    .mutation(async ({ ctx, input }) =>
      toCommandResponse(await createDraft(ctx.actor, input))
    ),
  saveDraft: authenticatedProcedure
    .input(z.unknown())
    .mutation(async ({ ctx, input }) =>
      toCommandResponse(await saveDraft(ctx.actor, input))
    ),
  submitRequest: authenticatedProcedure
    .input(z.unknown())
    .mutation(async ({ ctx, input }) =>
      toCommandResponse(await submitRequest(ctx.actor, input))
    )
});

export type AppRouter = typeof appRouter;
