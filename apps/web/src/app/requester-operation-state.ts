export type RequesterOperation =
  | "idle"
  | "loadingWorkspace"
  | "loadingRequest"
  | "creatingAccount"
  | "signingIn"
  | "signingOut"
  | "refreshingWorkspace"
  | "creatingDraft"
  | "savingDraft"
  | "submittingRequest";

const requesterOperationLabels = {
  creatingAccount: "Creating account",
  creatingDraft: "Creating draft",
  loadingRequest: "Loading request",
  loadingWorkspace: "Loading workspace",
  refreshingWorkspace: "Refreshing workspace",
  savingDraft: "Saving draft",
  signingIn: "Signing in",
  signingOut: "Signing out",
  submittingRequest: "Submitting request"
} satisfies Record<Exclude<RequesterOperation, "idle">, string>;

export const isRequesterOperationActive = (operation: RequesterOperation) =>
  operation !== "idle";

export const requesterOperationStatus = (operation: RequesterOperation) =>
  operation === "idle" ? null : requesterOperationLabels[operation];

export const isDraftCommandOperation = (operation: RequesterOperation) =>
  operation === "savingDraft" || operation === "submittingRequest";
