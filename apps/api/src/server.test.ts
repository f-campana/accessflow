import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildServer } from "./server";
import { resetDatabase } from "./test-helpers/db";

describe("api server", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await server.close();
  });

  it("serves a health route", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "accessflow-api"
    });
  });

  it("serves a real Better Auth local session path", async () => {
    const email = `session-${crypto.randomUUID()}@example.test`;
    const signUp = await server.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: {
        name: "Session Test",
        email,
        password: "development-password"
      }
    });
    const setCookie = signUp.headers["set-cookie"];
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const cookieHeader = cookies
      .filter((cookie): cookie is string => typeof cookie === "string")
      .map((cookie) => cookie.split(";")[0])
      .join("; ");

    expect(signUp.statusCode).toBeLessThan(300);
    expect(cookieHeader).toContain("better-auth");

    const session = await server.inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: {
        cookie: cookieHeader
      }
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toEqual(
      expect.objectContaining({
        user: expect.objectContaining({
          email,
          role: "requester"
        })
      })
    );
  });
});
