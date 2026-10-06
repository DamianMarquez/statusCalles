CREATE TABLE "mobility_infrastructure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" varchar(180) NOT NULL,
	"type" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"geometry" geometry(Geometry,4326) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "geographic_sources" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "mobility_infrastructure" ADD CONSTRAINT "mobility_infrastructure_source_id_geographic_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."geographic_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mobility_infrastructure_source_external_unique" ON "mobility_infrastructure" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX "mobility_infrastructure_geometry_gix" ON "mobility_infrastructure" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "mobility_infrastructure_type_idx" ON "mobility_infrastructure" USING btree ("type");