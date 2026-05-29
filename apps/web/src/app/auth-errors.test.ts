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

  it("does not render unknown JSON payloads", () => {
    expect(
      authErrorMessageFromBody(
        '{"message":"database host leaked","code":"SOME_INTERNAL_CODE"}',
        500
      )
    ).toBe("Auth request failed. Try again.");
  });

  it("does not render malformed non-JSON payloads", () => {
    expect(authErrorMessageFromBody("<html>Internal Error</html>", 500)).toBe(
      "Auth request failed. Try again."
    );
  });

  it("falls back when caught errors look like raw payloads", () => {
    expect(
      authErrorMessageFromCaught(
        new Error('{"message":"provider payload","code":"INTERNAL"}'),
        "Auth failed"
      )
    ).toBe("Auth failed");
  });

  it("keeps ordinary thrown error messages", () => {
    expect(authErrorMessageFromCaught(new Error("Network unavailable"), "Auth failed"))
      .toBe("Network unavailable");
  });
});
