import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";

import { buildServer } from "./server";
import { createTestStudy, resetDatabase } from "./test-helpers/db";

type TrpcSuccessEnvelope<T> = [
  {
    result: {
      data: T;
    };
  }
];

type TrpcErrorEnvelope = [
  {
    error: {
      message: string;
      data: {
        code: string;
        httpStatus: number;
      };
    };
  }
];

type TrpcActor = {
  id: string;
  email: string;
  role: "requester" | "reviewer" | "admin";
};

type TrpcStudy = {
  id: string;
  displayName: string;
};

type CreateDraftHttpResponse =
  | {
      ok: true;
      value: {
        requestId: string;
        draftId: string;
        status: "draft";
      };
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

type CommandValidationFailure = {
  ok: false;
  error: {
    code: "ValidationError";
    message: string;
    fieldErrors?: Record<string, string[]>;
  };
};

const readTrpcData = <T>(response: { json: () => unknown }): T => {
  const [envelope] = response.json() as TrpcSuccessEnvelope<T>;

  if (!envelope?.result) {
    throw new Error("Expected a tRPC success envelope");
  }

  return envelope.result.data;
};

const readTrpcError = (response: { json: () => unknown }) => {
  const [envelope] = response.json() as TrpcErrorEnvelope;

  if (!envelope?.error) {
    throw new Error("Expected a tRPC error envelope");
  }

  return envelope.error;
};

const cookieHeaderFrom = (setCookie: unknown) => {
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  return cookies
    .filter((cookie): cookie is string => typeof cookie === "string")
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
};

const signUpRequester = async (server: FastifyInstance) => {
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
  const cookieHeader = cookieHeaderFrom(signUp.headers["set-cookie"]);

  expect(signUp.statusCode).toBeLessThan(300);
  expect(cookieHeader).toContain("better-auth");

  return {
    email,
    cookieHeader
  };
};

const expectCommandValidationFailure = async (
  server: FastifyInstance,
  cookieHeader: string,
  procedure: "createDraft" | "saveDraft" | "submitRequest",
  payload: unknown
) => {
  const response = await server.inject({
    method: "POST",
    url: `/trpc/${procedure}?batch=1`,
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader
    },
    payload: {
      0: payload
    }
  });

  expect(response.statusCode).toBe(200);
  expect(readTrpcData<CommandValidationFailure>(response)).toEqual(
    expect.objectContaining({
      ok: false,
      error: expect.objectContaining({
        code: "ValidationError"
      })
    })
  );
};

describe("api server", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
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
    const { cookieHeader, email } = await signUpRequester(server);

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

  it("resolves the tRPC actor from a real Better Auth cookie", async () => {
    const { cookieHeader, email } = await signUpRequester(server);
    const response = await server.inject({
      method: "GET",
      url: "/trpc/me?batch=1&input=%7B%7D",
      headers: {
        cookie: cookieHeader
      }
    });

    expect(response.statusCode).toBe(200);
    expect(readTrpcData<TrpcActor | null>(response)).toEqual(
      expect.objectContaining({
        email,
        role: "requester"
      })
    );
  });

  it("rejects protected tRPC procedures without a session cookie", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/trpc/studies?batch=1&input=%7B%7D"
    });

    expect(response.statusCode).toBe(401);
    expect(readTrpcError(response)).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          code: "UNAUTHORIZED",
          httpStatus: 401
        })
      })
    );
  });

  it("runs protected tRPC queries and mutations with the real session cookie", async () => {
    const { cookieHeader } = await signUpRequester(server);
    const study = await createTestStudy();

    const studiesResponse = await server.inject({
      method: "GET",
      url: "/trpc/studies?batch=1&input=%7B%7D",
      headers: {
        cookie: cookieHeader
      }
    });

    expect(studiesResponse.statusCode).toBe(200);
    expect(readTrpcData<TrpcStudy[]>(studiesResponse)).toEqual([
      expect.objectContaining({ id: study.id })
    ]);

    const createDraftResponse = await server.inject({
      method: "POST",
      url: "/trpc/createDraft?batch=1",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader
      },
      payload: {
        0: {
          studyId: study.id
        }
      }
    });

    expect(createDraftResponse.statusCode).toBe(200);
    expect(readTrpcData<CreateDraftHttpResponse>(createDraftResponse)).toEqual(
      expect.objectContaining({
        ok: true,
        value: expect.objectContaining({
          status: "draft"
        })
      })
    );
  });

  it("returns typed command validation errors for malformed tRPC command input", async () => {
    const { cookieHeader } = await signUpRequester(server);

    await expectCommandValidationFailure(server, cookieHeader, "createDraft", {
      studyId: "not-a-study-id"
    });
    await expectCommandValidationFailure(server, cookieHeader, "saveDraft", {
      draftId: "not-a-draft-id"
    });
    await expectCommandValidationFailure(server, cookieHeader, "submitRequest", {
      draftId: "not-a-draft-id",
      idempotencyKey: "short"
    });
  });
});
