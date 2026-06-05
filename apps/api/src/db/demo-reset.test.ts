import { describe, expect, it } from "vitest";

import { assertSafeDemoResetTarget } from "./demo-reset";

describe("demo reset safety", () => {
  it("allows the local preview database", () => {
    expect(
      assertSafeDemoResetTarget(
        "postgres://accessflow:accessflow@localhost:55433/accessflow",
        "development"
      )
    ).toEqual({
      databaseName: "accessflow",
      host: "localhost",
      port: "55433"
    });
  });

  it("refuses production mode", () => {
    expect(() =>
      assertSafeDemoResetTarget(
        "postgres://accessflow:accessflow@localhost:55433/accessflow",
        "production"
      )
    ).toThrow("NODE_ENV=production");
  });

  it("refuses non-local hosts", () => {
    expect(() =>
      assertSafeDemoResetTarget(
        "postgres://accessflow:accessflow@db.example.com:55433/accessflow",
        "development"
      )
    ).toThrow("non-local demo database host");
  });

  it("refuses unexpected database names", () => {
    expect(() =>
      assertSafeDemoResetTarget(
        "postgres://accessflow:accessflow@localhost:55433/shared",
        "development"
      )
    ).toThrow('Expected "accessflow"');
  });
});
