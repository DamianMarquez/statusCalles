CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "report_feedback_user_id_idx" ON "report_feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "street_reports_user_id_idx" ON "street_reports" USING btree ("user_id");