CREATE TABLE "auth_sessions" (
	"token_hash" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"display_name" varchar(80) NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_feedback" ALTER COLUMN "voter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "report_feedback" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "street_reports" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "report_feedback" ADD CONSTRAINT "report_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_reports" ADD CONSTRAINT "street_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_feedback_report_user_unique" ON "report_feedback" USING btree ("report_id","user_id") WHERE "report_feedback"."user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "report_feedback" ADD CONSTRAINT "report_feedback_actor_check" CHECK (("report_feedback"."user_id" IS NOT NULL AND "report_feedback"."voter_id" IS NULL) OR ("report_feedback"."user_id" IS NULL AND "report_feedback"."voter_id" IS NOT NULL));