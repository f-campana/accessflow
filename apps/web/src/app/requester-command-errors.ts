type RequesterCommandError = {
  code: "Unexpected";
  message: string;
};

type CommandAction = "createDraft" | "saveDraft" | "submitRequest";

const commandFailureMessages = {
  createDraft:
    "Draft could not be created. No workflow change was confirmed. Try again.",
  saveDraft:
    "Draft could not be saved. No workflow change was confirmed. Try again.",
  submitRequest:
    "Request could not be submitted. No workflow change was confirmed. Try again."
} satisfies Record<CommandAction, string>;

const reloadFailureMessages = {
  createDraft:
    "Draft was created, but the workspace could not refresh. Retry refresh before continuing.",
  saveDraft:
    "Draft was saved, but the workspace could not refresh. Retry refresh before continuing.",
  submitRequest:
    "Request was submitted, but the workspace could not refresh. Retry refresh before continuing."
} satisfies Record<CommandAction, string>;

export const commandExceptionError = (
  action: CommandAction
): RequesterCommandError => ({
  code: "Unexpected",
  message: commandFailureMessages[action]
});

export const commandReloadError = (
  action: CommandAction
): RequesterCommandError => ({
  code: "Unexpected",
  message: reloadFailureMessages[action]
});

export const refreshRetryError = (): RequesterCommandError => ({
  code: "Unexpected",
  message: "Workspace could not refresh. Retry again before continuing."
});
