CREATE UNIQUE INDEX "study_access_requests_id_requester_idx" ON "study_access_requests" USING btree ("id","requester_id");--> statement-breakpoint
ALTER TABLE "study_access_request_drafts" ADD CONSTRAINT "study_access_request_drafts_request_owner_fk" FOREIGN KEY ("request_id","owner_id") REFERENCES "public"."study_access_requests"("id","requester_id") ON DELETE no action ON UPDATE no action;
