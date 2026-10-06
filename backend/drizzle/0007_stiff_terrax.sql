CREATE TYPE "public"."report_flag_reason" AS ENUM('SPAM', 'INAPPROPRIATE', 'FALSE_INFORMATION', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."report_moderation_status" AS ENUM('VISIBLE', 'HIDDEN');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('USER', 'MODERATOR', 'ADMIN');--> statement-breakpoint
CREATE TABLE "moderation_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"moderator_id" uuid NOT NULL,
	"report_id" uuid NOT NULL,
	"previous_status" "report_moderation_status" NOT NULL,
	"new_status" "report_moderation_status" NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" "report_flag_reason" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "street_reports" ADD COLUMN "moderation_status" "report_moderation_status" DEFAULT 'VISIBLE' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'USER' NOT NULL;--> statement-breakpoint
ALTER TABLE "moderation_audit" ADD CONSTRAINT "moderation_audit_moderator_id_users_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_audit" ADD CONSTRAINT "moderation_audit_report_id_street_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."street_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_flags" ADD CONSTRAINT "report_flags_report_id_street_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."street_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_flags" ADD CONSTRAINT "report_flags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_flags_report_user_unique" ON "report_flags" USING btree ("report_id","user_id");--> statement-breakpoint
CREATE INDEX "report_flags_reviewed_created_idx" ON "report_flags" USING btree ("reviewed_at","created_at");