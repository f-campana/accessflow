import { describe, expect, it } from "vitest";
import { z } from "zod";

import { fromZod, invalidTransition, ok } from ".";

describe("Result helpers", () => {
  it("creates successful result values", () => {
    expect(ok("ready")).toEqual({ ok: true, value: "ready" });
  });

  it("creates typed application errors", () => {
    expect(invalidTransition("No transition")).toEqual({
      code: "InvalidTransition",
      message: "No transition"
    });
  });

  it("converts Zod failures into validation errors", () => {
    const schema = z.object({ email: z.string().email() });
    const result = fromZod(schema.safeParse({ email: "not-an-email" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("ValidationError");
      expect(result.error.fieldErrors?.email).toHaveLength(1);
    }
  });
});
