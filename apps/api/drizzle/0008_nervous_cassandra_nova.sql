ALTER TYPE "public"."workflow_event_type" ADD VALUE 'withdrawRequest';--> statement-breakpoint
ALTER TYPE "public"."workflow_event_type" ADD VALUE 'reopenRequest';--> statement-breakpoint
ALTER TABLE "study_access_audit_events" DROP CONSTRAINT "study_access_audit_events_transition_check";--> statement-breakpoint
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
        or
        (
          ("study_access_audit_events"."event_type")::text = 'withdrawRequest'
          and "study_access_audit_events"."from_status" = 'submitted'
          and "study_access_audit_events"."to_status" = 'withdrawn'
        )
        or
        (
          ("study_access_audit_events"."event_type")::text = 'withdrawRequest'
          and "study_access_audit_events"."from_status" = 'under_review'
          and "study_access_audit_events"."to_status" = 'withdrawn'
        )
        or
        (
          ("study_access_audit_events"."event_type")::text = 'reopenRequest'
          and "study_access_audit_events"."from_status" = 'rejected'
          and "study_access_audit_events"."to_status" = 'draft'
        )
      );