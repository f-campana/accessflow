import { initTRPC, TRPCError } from "@trpc/server";

import type { AuthenticatedActor, RequestContext } from "./context";

const t = initTRPC.context<RequestContext>().create();

export const router = t.router;
export const publicProcedure = t.procedure;

const requireActor = t.middleware(({ ctx, next }) => {
  if (!ctx.actor) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required"
    });
  }

  return next({
    ctx: {
      ...ctx,
      actor: ctx.actor as AuthenticatedActor
    }
  });
});

export const authenticatedProcedure = t.procedure.use(requireActor);
