import {
  forbidden,
  ok,
  type AppError,
  type Result
} from "@accessflow/core";

import type { AuthenticatedActor } from "../../context";

export const ensureRequester = (
  actor: AuthenticatedActor
): Result<true, AppError> =>
  actor.role === "requester"
    ? ok(true)
    : {
        ok: false,
        error: forbidden("Only requesters can manage access request drafts")
      };
