import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  fromZod,
  invalidTransition,
  ok,
  unexpected,
  validationError,
  type AppError
} from ".";

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

  it("keeps validation details on the validation error variant", () => {
    expect(validationError()).toEqual({
      code: "ValidationError",
      message: "Validation failed",
      fieldErrors: {},
      formErrors: []
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

  it("keeps form-level Zod errors", () => {
    const schema = z
      .object({
        first: z.string(),
        second: z.string()
      })
      .refine((value) => value.first !== value.second, {
        message: "Values must be different"
      });
    const result = fromZod(schema.safeParse({ first: "same", second: "same" }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.formErrors).toEqual(["Values must be different"]);
    }
  });

  it("makes invalid error states unrepresentable to TypeScript", () => {
    const nonValidationError = unexpected();

    // @ts-expect-error Non-validation errors do not expose field errors.
    const _fieldErrors = nonValidationError.fieldErrors;

    // @ts-expect-error Validation errors must carry validation details.
    const _incompleteValidationError: AppError = {
      code: "ValidationError",
      message: "Incomplete"
    };
  });
});
