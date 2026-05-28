import type { FastifyReply, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";

import { auth } from "./auth";
import { appRoleValues } from "./db/schema";

export type ActorRole = "requester" | "reviewer" | "admin";

export type AuthenticatedActor = {
  id: string;
  email: string;
  role: ActorRole;
};

export type RequestContext = {
  actor: AuthenticatedActor | null;
  requestId: string;
  req: FastifyRequest;
  res: FastifyReply;
};

const actorRoleSchema = z.enum(appRoleValues);

export const resolveActorFromRequest = async (
  req: FastifyRequest
): Promise<AuthenticatedActor | null> => {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers)
  });

  if (!session) {
    return null;
  }

  const role = actorRoleSchema.safeParse(session.user.role);

  if (!role.success) {
    req.log.warn(
      { userId: session.user.id },
      "Authenticated user has an invalid AccessFlow role"
    );
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email,
    role: role.data
  };
};

export const createRequestContext = async (
  req: FastifyRequest,
  res: FastifyReply
): Promise<RequestContext> => ({
  actor: await resolveActorFromRequest(req),
  requestId: req.id,
  req,
  res
});
