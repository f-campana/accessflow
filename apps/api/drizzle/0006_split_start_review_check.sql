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
      );
