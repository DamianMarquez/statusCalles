CREATE TABLE "communes" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(80) NOT NULL,
	"geometry" geometry(MultiPolygon,4326) NOT NULL,
	"source_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geographic_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"provider" varchar(120) NOT NULL,
	"dataset" varchar(120) NOT NULL,
	"source_url" text NOT NULL,
	"license" varchar(80) NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_status" varchar(20) DEFAULT 'NEVER' NOT NULL,
	"last_record_count" integer,
	"last_error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "neighborhoods" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"normalized_name" varchar(120) NOT NULL,
	"commune_id" integer NOT NULL,
	"geometry" geometry(MultiPolygon,4326) NOT NULL,
	"source_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "street_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_segment_id" varchar(100) NOT NULL,
	"street_id" uuid NOT NULL,
	"neighborhood_id" integer,
	"commune_id" integer,
	"geometry" geometry(MultiLineString,4326) NOT NULL,
	"source_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "streets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_code" varchar(100) NOT NULL,
	"official_name" varchar(200) NOT NULL,
	"normalized_name" varchar(200) NOT NULL,
	"source_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "street_reports" ADD COLUMN "street_id" uuid;--> statement-breakpoint
ALTER TABLE "street_reports" ADD COLUMN "street_segment_id" uuid;--> statement-breakpoint
ALTER TABLE "communes" ADD CONSTRAINT "communes_source_id_geographic_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."geographic_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "neighborhoods" ADD CONSTRAINT "neighborhoods_source_id_geographic_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."geographic_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segments" ADD CONSTRAINT "street_segments_street_id_streets_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."streets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segments" ADD CONSTRAINT "street_segments_neighborhood_id_neighborhoods_id_fk" FOREIGN KEY ("neighborhood_id") REFERENCES "public"."neighborhoods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segments" ADD CONSTRAINT "street_segments_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segments" ADD CONSTRAINT "street_segments_source_id_geographic_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."geographic_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "streets" ADD CONSTRAINT "streets_source_id_geographic_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."geographic_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "geographic_sources_slug_unique" ON "geographic_sources" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "neighborhoods_name_normalized_unique" ON "neighborhoods" USING btree ("normalized_name");--> statement-breakpoint
CREATE INDEX "neighborhoods_commune_id_idx" ON "neighborhoods" USING btree ("commune_id");--> statement-breakpoint
CREATE INDEX "neighborhoods_geometry_gix" ON "neighborhoods" USING gist ("geometry");--> statement-breakpoint
CREATE UNIQUE INDEX "street_segments_source_id_unique" ON "street_segments" USING btree ("source_segment_id");--> statement-breakpoint
CREATE INDEX "street_segments_street_id_idx" ON "street_segments" USING btree ("street_id");--> statement-breakpoint
CREATE INDEX "street_segments_neighborhood_id_idx" ON "street_segments" USING btree ("neighborhood_id");--> statement-breakpoint
CREATE INDEX "street_segments_commune_id_idx" ON "street_segments" USING btree ("commune_id");--> statement-breakpoint
CREATE INDEX "street_segments_geometry_gix" ON "street_segments" USING gist ("geometry");--> statement-breakpoint
CREATE UNIQUE INDEX "streets_source_code_unique" ON "streets" USING btree ("source_code");--> statement-breakpoint
CREATE INDEX "streets_name_normalized_idx" ON "streets" USING btree ("normalized_name");--> statement-breakpoint
ALTER TABLE "street_reports" ADD CONSTRAINT "street_reports_street_id_streets_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."streets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_reports" ADD CONSTRAINT "street_reports_street_segment_id_street_segments_id_fk" FOREIGN KEY ("street_segment_id") REFERENCES "public"."street_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "street_reports_street_id_idx" ON "street_reports" USING btree ("street_id");