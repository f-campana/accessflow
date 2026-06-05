import { unexpected, type NonValidationAppError } from "@accessflow/core";

type CommandAction =
  | "createDraft"
  | "saveDraft"
  | "submitRequest"
  | "withdrawRequest"
  | "reopenRequest";

export const commandFailureMessages = {
  createDraft:
    "Draft could not be created. No workflow change was confirmed. Try again.",
  saveDraft:
    "Draft could not be saved. No workflow change was confirmed. Try again.",
  submitRequest:
    "Request could not be submitted. No workflow change was confirmed. Try again.",
  withdrawRequest:
    "Request could not be withdrawn. No workflow change was confirmed. Try again.",
  reopenRequest:
    "Request could not be reopened. No workflow change was confirmed. Try again."
} satisfies Record<CommandAction, string>;

export const reloadFailureMessages = {
  createDraft:
    "Draft was created, but the workspace could not refresh. Retry refresh before continuing.",
  saveDraft:
    "Draft was saved, but the workspace could not refresh. Retry refresh before continuing.",
  submitRequest:
    "Request was submitted, but the workspace could not refresh. Retry refresh before continuing.",
  withdrawRequest:
    "Request was withdrawn, but the workspace could not refresh. Retry refresh before continuing.",
  reopenRequest:
    "Request was reopened, but the workspace could not refresh. Retry refresh before continuing."
} satisfies Record<CommandAction, string>;

export const commandExceptionError = (
  action: CommandAction
): NonValidationAppError => unexpected(commandFailureMessages[action]);

export const commandReloadError = (
  action: CommandAction
): NonValidationAppError => unexpected(reloadFailureMessages[action]);

export const refreshRetryMessage =
  "Workspace could not refresh. Retry again before continuing.";

export const safeRequesterCommandMessages = new Set<string>([
  ...Object.values(commandFailureMessages),
  ...Object.values(reloadFailureMessages),
  refreshRetryMessage
]);

export const refreshRetryError = (): NonValidationAppError =>
  unexpected(refreshRetryMessage);
