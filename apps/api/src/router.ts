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
import {
  getRequesterStudyAccess,
  listStudies
} from "./queries/study-access";
import { authenticatedProcedure, publicProcedure, router } from "./trpc";
import { z } from "zod";

export const appRouter = router({
  health: publicProcedure.query(() => ({
    ok: true,
    service: "accessflow-api"
  })),
  me: publicProcedure.query(({ ctx }) => ctx.actor),
  studies: authenticatedProcedure.query(() => listStudies()),
  myStudyAccess: authenticatedProcedure
    .input(z.object({ studyId: z.uuid() }))
    .query(({ ctx, input }) => getRequesterStudyAccess(ctx.actor, input.studyId)),
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
