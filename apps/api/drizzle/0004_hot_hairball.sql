ALTER TABLE "study_access_audit_events" ADD CONSTRAINT "study_access_audit_events_transition_check" CHECK (
        (
          "study_access_audit_events"."event_type" = 'submitRequest'
          and "study_access_audit_events"."from_status" = 'draft'
          and "study_access_audit_events"."to_status" = 'submitted'
        )
      );