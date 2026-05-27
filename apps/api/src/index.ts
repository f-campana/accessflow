import { env } from "./env";
import { buildServer } from "./server";

const server = await buildServer();

try {
  await server.listen({
    host: env.HOST,
    port: env.PORT
  });
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
