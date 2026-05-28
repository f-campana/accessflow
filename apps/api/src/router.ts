import { toCommandResponse } from "@accessflow/core";
import {
  createDraft,
  saveDraft,
  submitRequest
} from "./commands/study-access";
import {
  createDraftInputSchema,
  saveDraftInputSchema,
  submitRequestInputSchema
} from "./commands/validation";
import { authenticatedProcedure, publicProcedure, router } from "./trpc";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true,
    service: "accessflow-api"
  })),
  createDraft: authenticatedProcedure
    .input(createDraftInputSchema)
    .mutation(async ({ ctx, input }) =>
      toCommandResponse(await createDraft(ctx.actor, input))
    ),
  saveDraft: authenticatedProcedure
    .input(saveDraftInputSchema)
    .mutation(async ({ ctx, input }) =>
      toCommandResponse(await saveDraft(ctx.actor, input))
    ),
  submitRequest: authenticatedProcedure
    .input(submitRequestInputSchema)
    .mutation(async ({ ctx, input }) =>
      toCommandResponse(await submitRequest(ctx.actor, input))
    )
});

export type AppRouter = typeof appRouter;
