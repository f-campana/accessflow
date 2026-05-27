import type { FastifyReply, FastifyRequest } from "fastify";

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

export const resolveActorFromRequest = async (
  _req: FastifyRequest
): Promise<AuthenticatedActor | null> => {
  // Better Auth session resolution belongs here once auth is wired.
  // This scaffold intentionally never fabricates an authenticated actor.
  return null;
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
