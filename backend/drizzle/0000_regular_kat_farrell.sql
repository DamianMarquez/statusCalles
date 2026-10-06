CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('ACTIVE', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('POTHOLE', 'FLOOD', 'ROAD_DAMAGE', 'ROAD_BLOCKED', 'ROAD_WORK', 'TRAFFIC_LIGHT', 'OTHER');--> statement-breakpoint
CREATE TABLE "street_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "report_type" NOT NULL,
	"severity" smallint NOT NULL,
	"description" varchar(500) NOT NULL,
	"location" geography(Point,4326) NOT NULL,
	"status" "report_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "street_reports_severity_range_check" CHECK ("street_reports"."severity" BETWEEN 1 AND 4),
	CONSTRAINT "street_reports_description_not_blank_check" CHECK (length(trim("street_reports"."description")) > 0)
);
--> statement-breakpoint
CREATE INDEX "street_reports_location_gix" ON "street_reports" USING gist ("location");--> statement-breakpoint
CREATE INDEX "street_reports_created_at_idx" ON "street_reports" USING btree ("created_at");
