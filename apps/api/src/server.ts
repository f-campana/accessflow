import cors from "@fastify/cors";
import {
  fastifyTRPCPlugin,
  type CreateFastifyContextOptions
} from "@trpc/server/adapters/fastify";
import Fastify from "fastify";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from "./auth";
import { createRequestContext } from "./context";
import { env } from "./env";
import { appRouter } from "./router";

const createTRPCContext = ({ req, res }: CreateFastifyContextOptions) =>
  createRequestContext(req, res);

export const buildServer = async () => {
  const server = Fastify({
    logger: {
      level: env.LOG_LEVEL
    }
  });

  await server.register(cors, {
    credentials: true,
    origin: env.WEB_ORIGIN
  });

  server.get("/health", async () => ({
    ok: true,
    service: "accessflow-api"
  }));

  server.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const body =
        request.body === undefined ? undefined : JSON.stringify(request.body);
      const authRequest = new Request(url.toString(), {
        method: request.method,
        headers: fromNodeHeaders(request.headers),
        ...(body ? { body } : {})
      });
      const response = await auth.handler(authRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));

      return reply.send(response.body ? await response.text() : null);
    }
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createTRPCContext
    }
  });

  return server;
};
