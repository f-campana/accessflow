export type AsyncRequestGuard = {
  begin: () => number;
  invalidate: () => number;
  isCurrent: (requestId: number) => boolean;
};

export const createAsyncRequestGuard = (): AsyncRequestGuard => {
  let currentRequestId = 0;

  return {
    begin: () => {
      currentRequestId += 1;
      return currentRequestId;
    },
    invalidate: () => {
      currentRequestId += 1;
      return currentRequestId;
    },
    isCurrent: (requestId) => requestId === currentRequestId
  };
};
