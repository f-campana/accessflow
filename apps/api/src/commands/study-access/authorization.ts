import {
  forbidden,
  ok,
  type AppError,
  type Result
} from "@accessflow/core";

import type { AuthenticatedActor } from "../../context";
import { requesterOnly } from "../types";

export const ensureRequester = (
  actor: AuthenticatedActor
): Result<true, AppError> =>
  requesterOnly(actor)
    ? ok(true)
    : {
        ok: false,
        error: forbidden("Only requesters can manage access request drafts")
      };
