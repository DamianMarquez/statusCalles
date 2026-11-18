CREATE TABLE "street_scores" (
	"street_id" uuid PRIMARY KEY NOT NULL,
	"score" smallint,
	"level" varchar(20),
	"has_evidence" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "street_segment_scores" (
	"segment_id" uuid PRIMARY KEY NOT NULL,
	"street_id" uuid NOT NULL,
	"score" smallint,
	"level" varchar(20),
	"has_evidence" boolean NOT NULL,
	"result" jsonb NOT NULL,
	"calculated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "street_scores" ADD CONSTRAINT "street_scores_street_id_streets_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."streets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segment_scores" ADD CONSTRAINT "street_segment_scores_segment_id_street_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."street_segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "street_segment_scores" ADD CONSTRAINT "street_segment_scores_street_id_streets_id_fk" FOREIGN KEY ("street_id") REFERENCES "public"."streets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "street_segment_scores_street_id_idx" ON "street_segment_scores" USING btree ("street_id");--> statement-breakpoint
CREATE INDEX "street_reports_visible_segment_idx" ON "street_reports" USING btree ("street_segment_id") WHERE "street_reports"."moderation_status" = 'VISIBLE';--> statement-breakpoint
CREATE INDEX "street_segments_road_class_street_idx" ON "street_segments" USING btree ("road_class","street_id");--> statement-breakpoint
CREATE MATERIALIZED VIEW "street_class_geometries" AS
SELECT ss.street_id, ss.road_class, st.official_name,
  ST_Multi(ST_CollectionExtract(ST_LineMerge(ST_CollectionExtract(ST_Collect(ss.geometry), 2)), 2)) AS geometry
FROM street_segments ss
JOIN streets st ON st.id = ss.street_id
GROUP BY ss.street_id, ss.road_class, st.official_name;--> statement-breakpoint
CREATE UNIQUE INDEX "street_class_geometries_pk" ON "street_class_geometries" USING btree ("street_id","road_class");--> statement-breakpoint
CREATE INDEX "street_class_geometries_geometry_gix" ON "street_class_geometries" USING gist ("geometry");
