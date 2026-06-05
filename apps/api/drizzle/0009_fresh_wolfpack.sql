ALTER TABLE "study_access_requests" DROP CONSTRAINT "study_access_requests_state_fields_check";--> statement-breakpoint
ALTER TABLE "study_access_requests" ADD CONSTRAINT "study_access_requests_state_fields_check" CHECK (
        (
          "study_access_requests"."status" = 'draft'
          and "study_access_requests"."submitted_at" is null
          and "study_access_requests"."decided_at" is null
          and "study_access_requests"."decision_note" is null
        )
        or
        (
          "study_access_requests"."status" in ('submitted', 'under_review')
          and "study_access_requests"."submitted_at" is not null
          and "study_access_requests"."requested_role" is not null
          and "study_access_requests"."decided_at" is null
          and "study_access_requests"."decision_note" is null
        )
        or
        (
          "study_access_requests"."status" = 'approved'
          and "study_access_requests"."submitted_at" is not null
          and "study_access_requests"."requested_role" is not null
          and "study_access_requests"."decided_at" is not null
          and "study_access_requests"."decision_note" is null
        )
        or
        (
          "study_access_requests"."status" = 'rejected'
          and "study_access_requests"."submitted_at" is not null
          and "study_access_requests"."requested_role" is not null
          and "study_access_requests"."decided_at" is not null
          and "study_access_requests"."decision_note" is not null
          and length(trim("study_access_requests"."decision_note")) > 0
        )
        or
        (
          "study_access_requests"."status" = 'withdrawn'
          and "study_access_requests"."submitted_at" is not null
          and "study_access_requests"."requested_role" is not null
          and "study_access_requests"."decided_at" is null
          and "study_access_requests"."decision_note" is null
        )
        or
        (
          "study_access_requests"."status" = 'revoked'
          and "study_access_requests"."submitted_at" is not null
          and "study_access_requests"."requested_role" is not null
        )
      );