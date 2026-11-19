CREATE TABLE "street_segment_surface_baseline" (
	"segment_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"surface_type" "surface_type" NOT NULL,
	"source_ref" varchar(100),
	"match_ratio" real NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "street_segment_surface_baseline_segment_id_source_id_pk" PRIMARY KEY("segment_id","source_id")
);
--> statement-breakpoint
ALTER TABLE "street_segment_surface_baseline" ADD CONSTRAINT "street_segment_surface_baseline_segment_id_street_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."street_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segment_surface_baseline" ADD CONSTRAINT "street_segment_surface_baseline_source_id_geographic_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."geographic_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "street_segment_surface_baseline_source_idx" ON "street_segment_surface_baseline" USING btree ("source_id");--> statement-breakpoint
CREATE VIEW "street_segment_surface_base" AS
SELECT DISTINCT ON (b.segment_id)
  b.segment_id, b.surface_type, gs.slug AS source_slug, b.source_ref, b.match_ratio, b.imported_at
FROM street_segment_surface_baseline b
JOIN geographic_sources gs ON gs.id = b.source_id
ORDER BY b.segment_id,
  CASE gs.slug WHEN 'gcba-adoquinado' THEN 1 WHEN 'osm-surface' THEN 2 ELSE 9 END;
