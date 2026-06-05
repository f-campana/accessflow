ALTER TYPE "public"."workflow_event_type" ADD VALUE 'approveRequest';--> statement-breakpoint
ALTER TYPE "public"."workflow_event_type" ADD VALUE 'rejectRequest';--> statement-breakpoint
ALTER TABLE "study_access_audit_events" DROP CONSTRAINT "study_access_audit_events_transition_check";--> statement-breakpoint
ALTER TABLE "study_access_requests" DROP CONSTRAINT "study_access_requests_state_fields_check";--> statement-breakpoint
ALTER TABLE "study_access_audit_events" ADD CONSTRAINT "study_access_audit_events_transition_check" CHECK (
        (
          ("study_access_audit_events"."event_type")::text = 'submitRequest'
          and "study_access_audit_events"."from_status" = 'draft'
          and "study_access_audit_events"."to_status" = 'submitted'
        )
        or
        (
          ("study_access_audit_events"."event_type")::text = 'startReview'
          and "study_access_audit_events"."from_status" = 'submitted'
          and "study_access_audit_events"."to_status" = 'under_review'
        )
        or
        (
          ("study_access_audit_events"."event_type")::text = 'approveRequest'
          and "study_access_audit_events"."from_status" = 'under_review'
          and "study_access_audit_events"."to_status" = 'approved'
        )
        or
        (
          ("study_access_audit_events"."event_type")::text = 'rejectRequest'
          and "study_access_audit_events"."from_status" = 'under_review'
          and "study_access_audit_events"."to_status" = 'rejected'
        )
      );--> statement-breakpoint
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
          "study_access_requests"."status" in ('withdrawn', 'revoked')
          and "study_access_requests"."submitted_at" is not null
          and "study_access_requests"."requested_role" is not null
        )
      );