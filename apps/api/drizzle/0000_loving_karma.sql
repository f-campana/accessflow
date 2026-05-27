CREATE TYPE "public"."study_access_request_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('requester', 'reviewer', 'admin');--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_name" text NOT NULL,
	"key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"result_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "studies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"short_description" text NOT NULL,
	"sensitivity_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "study_access_audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"from_status" "study_access_request_status" NOT NULL,
	"to_status" "study_access_request_status" NOT NULL,
	"note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_access_request_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"purpose" text,
	"requested_role" text,
	"justification" text,
	"affiliation" text,
	"supporting_notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"study_id" uuid NOT NULL,
	"status" "study_access_request_status" DEFAULT 'draft' NOT NULL,
	"requested_role" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "app_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_audit_events" ADD CONSTRAINT "study_access_audit_events_request_id_study_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."study_access_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_audit_events" ADD CONSTRAINT "study_access_audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_request_drafts" ADD CONSTRAINT "study_access_request_drafts_request_id_study_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."study_access_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_request_drafts" ADD CONSTRAINT "study_access_request_drafts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_requests" ADD CONSTRAINT "study_access_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_requests" ADD CONSTRAINT "study_access_requests_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_actor_command_key_idx" ON "idempotency_keys" USING btree ("actor_id","command_name","key");--> statement-breakpoint
CREATE INDEX "study_access_audit_events_request_idx" ON "study_access_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "study_access_audit_events_actor_idx" ON "study_access_audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_access_request_drafts_request_idx" ON "study_access_request_drafts" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "study_access_request_drafts_owner_idx" ON "study_access_request_drafts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "study_access_requests_requester_idx" ON "study_access_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "study_access_requests_study_idx" ON "study_access_requests" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "study_access_requests_status_idx" ON "study_access_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");