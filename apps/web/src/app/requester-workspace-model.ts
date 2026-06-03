import type { trpc } from "../trpc/client";
import type { AppError as CoreAppError } from "@accessflow/core";
import {
  parseRequestedStudyRole,
  type RequestedStudyRole
} from "@accessflow/workflow";

export type Actor = NonNullable<Awaited<ReturnType<(typeof trpc)["me"]["query"]>>>;

export type Study = Awaited<ReturnType<(typeof trpc)["studies"]["query"]>>[number];

export type DraftForm = {
  purpose: string;
  requestedRole: "" | RequestedStudyRole;
  justification: string;
  affiliation: string;
  supportingNotes: string;
};

export type RequesterDraftFieldName = keyof DraftForm;
export type AppError = CoreAppError<RequesterDraftFieldName>;

export type StudyAccess = Awaited<
  ReturnType<(typeof trpc)["myStudyAccess"]["query"]>
>;

export const emptyDraftForm: DraftForm = {
  purpose: "",
  requestedRole: "",
  justification: "",
  affiliation: "",
  supportingNotes: ""
};

export const toDraftRequestedRole = (
  value: unknown
): DraftForm["requestedRole"] => parseRequestedStudyRole(value) ?? "";

export const toDraftForm = (access: StudyAccess): DraftForm => ({
  purpose: access?.draft?.purpose ?? "",
  requestedRole: toDraftRequestedRole(access?.draft?.requestedRole),
  justification: access?.draft?.justification ?? "",
  affiliation: access?.draft?.affiliation ?? "",
  supportingNotes: access?.draft?.supportingNotes ?? ""
});

export const compactId = (value: string) => value.slice(0, 8);
