CREATE TYPE "public"."road_information_proposal_status" AS ENUM('PROPOSED', 'CONFIRMED');--> statement-breakpoint
CREATE TYPE "public"."road_type" AS ENUM('STREET', 'AVENUE', 'PASSAGE', 'BOULEVARD', 'HIGHWAY', 'ACCESS');--> statement-breakpoint
CREATE TYPE "public"."special_treatment" AS ENUM('NONE', 'BUS_STOP', 'SPEED_BUMP', 'PEDESTRIAN_CROSSING', 'INTERSECTION', 'SHOULDER', 'GUTTER', 'CURB_GUTTER');--> statement-breakpoint
CREATE TYPE "public"."surface_condition" AS ENUM('GOOD', 'REGULAR', 'POOR', 'VERY_POOR');--> statement-breakpoint
CREATE TYPE "public"."surface_type" AS ENUM('ASPHALT', 'SPECIAL_ASPHALT', 'CONCRETE', 'CONCRETE_ASPHALT', 'GRANITE_COBBLESTONE', 'GRANITULLO', 'CONCRETE_PAVER', 'INTERLOCKING_PAVER', 'PERMEABLE');--> statement-breakpoint
CREATE TABLE "street_segment_information" (
	"segment_id" uuid PRIMARY KEY NOT NULL,
	"road_type" "road_type",
	"surface_type" "surface_type",
	"surface_condition" "surface_condition",
	"special_treatments" "special_treatment"[],
	"updated_by_proposal_id" uuid,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "street_segment_information_confirmations" (
	"proposal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "street_segment_information_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"road_type" "road_type",
	"surface_type" "surface_type",
	"surface_condition" "surface_condition",
	"special_treatments" "special_treatment"[],
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "street_segment_information_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"segment_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"road_type" "road_type",
	"surface_type" "surface_type",
	"surface_condition" "surface_condition",
	"special_treatments" "special_treatment"[],
	"status" "road_information_proposal_status" DEFAULT 'PROPOSED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "street_segment_info_proposals_has_attribute_check" CHECK ("street_segment_information_proposals"."road_type" IS NOT NULL OR "street_segment_information_proposals"."surface_type" IS NOT NULL OR "street_segment_information_proposals"."surface_condition" IS NOT NULL OR "street_segment_information_proposals"."special_treatments" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "street_segment_information" ADD CONSTRAINT "street_segment_information_segment_id_street_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."street_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segment_information_confirmations" ADD CONSTRAINT "street_segment_information_confirmations_proposal_id_street_segment_information_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."street_segment_information_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segment_information_confirmations" ADD CONSTRAINT "street_segment_information_confirmations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segment_information_history" ADD CONSTRAINT "street_segment_information_history_segment_id_street_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."street_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segment_information_history" ADD CONSTRAINT "street_segment_information_history_proposal_id_street_segment_information_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."street_segment_information_proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segment_information_proposals" ADD CONSTRAINT "street_segment_information_proposals_segment_id_street_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."street_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segment_information_proposals" ADD CONSTRAINT "street_segment_information_proposals_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "street_segment_info_confirmation_user_unique" ON "street_segment_information_confirmations" USING btree ("proposal_id","user_id");--> statement-breakpoint
CREATE INDEX "street_segment_info_proposals_segment_created_idx" ON "street_segment_information_proposals" USING btree ("segment_id","created_at");--> statement-breakpoint
CREATE INDEX "street_segment_info_proposals_status_idx" ON "street_segment_information_proposals" USING btree ("status");