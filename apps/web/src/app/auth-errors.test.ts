import { describe, expect, it } from "vitest";

import {
  authErrorMessageFromBody,
  authErrorMessageFromCaught
} from "./auth-errors";

describe("auth error messages", () => {
  it("uses Better Auth JSON messages instead of showing raw JSON", () => {
    expect(
      authErrorMessageFromBody(
        '{"message":"Invalid email or password","code":"INVALID_EMAIL_OR_PASSWORD"}',
        401
      )
    ).toBe("Invalid email or password");
  });

  it("maps known auth error codes when message is missing", () => {
    expect(
      authErrorMessageFromBody('{"code":"INVALID_EMAIL_OR_PASSWORD"}', 401)
    ).toBe("Invalid email or password");
  });

  it("falls back to HTTP status when the response body is empty", () => {
    expect(authErrorMessageFromBody("", 401)).toBe(
      "Auth request failed with 401"
    );
  });

  it("keeps ordinary thrown error messages", () => {
    expect(authErrorMessageFromCaught(new Error("Network unavailable"), "Auth failed"))
      .toBe("Network unavailable");
  });
});
