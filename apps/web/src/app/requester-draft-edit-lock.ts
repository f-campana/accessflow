import {
  isDraftCommandOperation,
  type RequesterOperation
} from "./requester-operation-state";

export const isDraftCommandInFlight = (operation: RequesterOperation) =>
  isDraftCommandOperation(operation);

export const canEditDraftFields = ({
  canRetryRefresh,
  operation,
  isDraft
}: {
  canRetryRefresh: boolean;
  operation: RequesterOperation;
  isDraft: boolean;
}) => isDraft && !canRetryRefresh && !isDraftCommandInFlight(operation);
