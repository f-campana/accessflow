import { describe, expect, it } from "vitest";

import { createAsyncRequestGuard } from "./requester-async-guard";

describe("requester async guard", () => {
  it("accepts only the latest started request", () => {
    const guard = createAsyncRequestGuard();

    const firstRequest = guard.begin();
    const secondRequest = guard.begin();

    expect(guard.isCurrent(firstRequest)).toBe(false);
    expect(guard.isCurrent(secondRequest)).toBe(true);
  });

  it("invalidates in-flight requests without starting a replacement", () => {
    const guard = createAsyncRequestGuard();

    const request = guard.begin();
    guard.invalidate();

    expect(guard.isCurrent(request)).toBe(false);
  });
});
