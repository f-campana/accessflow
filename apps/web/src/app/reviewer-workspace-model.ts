import type { trpc } from "../trpc/client";

export type Actor = NonNullable<Awaited<ReturnType<(typeof trpc)["me"]["query"]>>>;

export type ReviewerInboxItem = Awaited<
  ReturnType<(typeof trpc)["reviewerInbox"]["query"]>
>[number];

export type ReviewerStudyAccessDetail = Awaited<
  ReturnType<(typeof trpc)["reviewerStudyAccessDetail"]["query"]>
>;

export const compactId = (value: string) => value.slice(0, 8);

export const reviewerOperationStatus = (operation: ReviewerOperation) => {
  switch (operation) {
    case "loadingWorkspace":
      return "Loading reviewer queue";
    case "loadingDetail":
      return "Loading request detail";
    case "signingIn":
      return "Signing in";
    case "signingOut":
      return "Signing out";
    case "idle":
      return null;
  }
};

export type ReviewerOperation =
  | "idle"
  | "loadingWorkspace"
  | "loadingDetail"
  | "signingIn"
  | "signingOut";
