CREATE TYPE "public"."report_feedback_type" AS ENUM('CONFIRM', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "report_feedback" (
	"report_id" uuid NOT NULL,
	"voter_id" uuid NOT NULL,
	"type" "report_feedback_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_feedback" ADD CONSTRAINT "report_feedback_report_id_street_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."street_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_feedback_report_voter_unique" ON "report_feedback" USING btree ("report_id","voter_id");