export const isDraftCommandInFlight = (busy: string | null) =>
  busy === "Saving draft" || busy === "Submitting request";

export const canEditDraftFields = ({
  busy,
  isDraft
}: {
  busy: string | null;
  isDraft: boolean;
}) => isDraft && !isDraftCommandInFlight(busy);
