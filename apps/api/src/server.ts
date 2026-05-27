import cors from "@fastify/cors";
import {
  fastifyTRPCPlugin,
  type CreateFastifyContextOptions
} from "@trpc/server/adapters/fastify";
import Fastify from "fastify";

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

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createTRPCContext
    }
  });

  return server;
};
