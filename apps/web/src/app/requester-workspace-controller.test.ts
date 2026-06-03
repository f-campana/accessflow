import { describe, expect, it } from "vitest";

import {
  deriveRequesterWorkspaceControllerState
} from "./requester-workspace-controller";
import type { Study, StudyAccess } from "./requester-workspace-model";

const studies = [
  {
    id: "study-1",
    displayName: "Aurora Study"
  },
  {
    id: "study-2",
    displayName: "Beacon Study"
  }
] as unknown as Study[];

const draftAccess = {
  request: {
    id: "request-1",
    status: "draft"
  },
  draft: {
    id: "draft-1"
  },
  auditEvents: []
} as unknown as StudyAccess;

const submittedAccess = {
  request: {
    id: "request-1",
    status: "submitted"
  },
  draft: {
    id: "draft-1"
  },
  auditEvents: []
} as unknown as StudyAccess;

describe("requester workspace controller state", () => {
  it("selects the current study and keeps idle state passive", () => {
    const state = deriveRequesterWorkspaceControllerState({
      access: null,
      canRetryRefresh: false,
      operation: "idle",
      selectedStudyId: "study-2",
      studies
    });

    expect(state.selectedStudy?.id).toBe("study-2");
    expect(state.operationActive).toBe(false);
    expect(state.operationStatus).toBeNull();
    expect(state.draftFieldsEditable).toBe(false);
  });

  it("locks draft fields while a draft command is in flight", () => {
    const state = deriveRequesterWorkspaceControllerState({
      access: draftAccess,
      canRetryRefresh: false,
      operation: "savingDraft",
      selectedStudyId: "study-1",
      studies
    });

    expect(state.isDraft).toBe(true);
    expect(state.draftId).toBe("draft-1");
    expect(state.draftCommandInFlight).toBe(true);
    expect(state.draftFieldsEditable).toBe(false);
  });

  it("locks draft fields while refresh retry is required", () => {
    const state = deriveRequesterWorkspaceControllerState({
      access: draftAccess,
      canRetryRefresh: true,
      operation: "idle",
      selectedStudyId: "study-1",
      studies
    });

    expect(state.isDraft).toBe(true);
    expect(state.draftCommandInFlight).toBe(false);
    expect(state.draftFieldsEditable).toBe(false);
  });

  it("marks submitted requests as read-only submitted state", () => {
    const state = deriveRequesterWorkspaceControllerState({
      access: submittedAccess,
      canRetryRefresh: false,
      operation: "idle",
      selectedStudyId: "study-1",
      studies
    });

    expect(state.isDraft).toBe(false);
    expect(state.isSubmitted).toBe(true);
    expect(state.draftFieldsEditable).toBe(false);
  });
});
