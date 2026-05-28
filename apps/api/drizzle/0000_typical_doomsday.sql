CREATE TYPE "public"."study_access_request_status" AS ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'withdrawn', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('requester', 'reviewer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."idempotency_status" AS ENUM('pending', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workflow_event_type" AS ENUM('submitRequest');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"command_name" text NOT NULL,
	"key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "idempotency_status" DEFAULT 'pending' NOT NULL,
	"result_reference" text,
	"response_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
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
	"actor_id" text NOT NULL,
	"event_type" "workflow_event_type" NOT NULL,
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
	"owner_id" text NOT NULL,
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
	"requester_id" text NOT NULL,
	"study_id" uuid NOT NULL,
	"status" "study_access_request_status" DEFAULT 'draft' NOT NULL,
	"requested_role" text,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "app_role" DEFAULT 'requester' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_audit_events" ADD CONSTRAINT "study_access_audit_events_request_id_study_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."study_access_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_audit_events" ADD CONSTRAINT "study_access_audit_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_request_drafts" ADD CONSTRAINT "study_access_request_drafts_request_id_study_access_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."study_access_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_request_drafts" ADD CONSTRAINT "study_access_request_drafts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_requests" ADD CONSTRAINT "study_access_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_access_requests" ADD CONSTRAINT "study_access_requests_study_id_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."studies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_actor_command_key_idx" ON "idempotency_keys" USING btree ("actor_id","command_name","key");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_idx" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "study_access_audit_events_request_idx" ON "study_access_audit_events" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "study_access_audit_events_actor_idx" ON "study_access_audit_events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "study_access_audit_events_timeline_idx" ON "study_access_audit_events" USING btree ("request_id","created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "study_access_request_drafts_request_idx" ON "study_access_request_drafts" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "study_access_request_drafts_owner_idx" ON "study_access_request_drafts" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "study_access_requests_requester_idx" ON "study_access_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "study_access_requests_study_idx" ON "study_access_requests" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "study_access_requests_status_idx" ON "study_access_requests" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");