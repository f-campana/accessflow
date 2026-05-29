ALTER TABLE "study_access_request_drafts" ADD CONSTRAINT "study_access_request_drafts_requested_role_check" CHECK ("study_access_request_drafts"."requested_role" is null or "study_access_request_drafts"."requested_role" in ('viewer', 'analyst'));--> statement-breakpoint
ALTER TABLE "study_access_requests" ADD CONSTRAINT "study_access_requests_requested_role_check" CHECK ("study_access_requests"."requested_role" is null or "study_access_requests"."requested_role" in ('viewer', 'analyst'));--> statement-breakpoint
ALTER TABLE "study_access_requests" ADD CONSTRAINT "study_access_requests_state_fields_check" CHECK (
        (
          "study_access_requests"."status" = 'draft'
          and "study_access_requests"."submitted_at" is null
          and "study_access_requests"."decided_at" is null
          and "study_access_requests"."decision_note" is null
        )
        or
        (
          "study_access_requests"."status" <> 'draft'
          and "study_access_requests"."submitted_at" is not null
          and "study_access_requests"."requested_role" is not null
        )
      );