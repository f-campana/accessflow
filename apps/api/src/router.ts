import { toCommandResponse } from "@accessflow/core";
import {
  createDraft,
  saveDraft,
  submitRequest
} from "./commands/study-access";
import {
  getReviewerStudyAccessDetail,
  getRequesterStudyAccess,
  listReviewerStudyAccessRequests,
  listStudies
} from "./queries/study-access";
import {
  authenticatedProcedure,
  publicProcedure,
  reviewerProcedure,
  router
} from "./trpc";
import { z } from "zod";

const authenticatedCommandProcedure = authenticatedProcedure.input(z.unknown());

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
  reviewerInbox: reviewerProcedure.query(() =>
    listReviewerStudyAccessRequests()
  ),
  reviewerStudyAccessDetail: reviewerProcedure
    .input(z.object({ requestId: z.uuid() }))
    .query(({ input }) => getReviewerStudyAccessDetail(input.requestId)),
  createDraft: authenticatedCommandProcedure.mutation(async ({ ctx, input }) =>
    toCommandResponse(await createDraft(ctx.actor, input))
  ),
  saveDraft: authenticatedCommandProcedure.mutation(async ({ ctx, input }) =>
    toCommandResponse(await saveDraft(ctx.actor, input))
  ),
  submitRequest: authenticatedCommandProcedure.mutation(async ({ ctx, input }) =>
    toCommandResponse(await submitRequest(ctx.actor, input))
  )
});

export type AppRouter = typeof appRouter;
