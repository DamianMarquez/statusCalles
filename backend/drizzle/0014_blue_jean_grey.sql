CREATE TYPE "public"."street_road_class" AS ENUM('PRIMARY', 'SECONDARY', 'LOCAL', 'UNKNOWN');--> statement-breakpoint
ALTER TABLE "street_segments" ADD COLUMN "road_class" "street_road_class" DEFAULT 'UNKNOWN' NOT NULL;
--> statement-breakpoint
UPDATE "street_segments"
SET "road_class" = CASE upper(btrim(coalesce("metadata" ->> 'red_jerarq', "metadata" ->> 'RED_JERARQ', '')))
  WHEN 'VÍA TRONCAL' THEN 'PRIMARY'::street_road_class
  WHEN 'VIA TRONCAL' THEN 'PRIMARY'::street_road_class
  WHEN 'VÍA DISTRIBUIDORA PRINCIPAL' THEN 'PRIMARY'::street_road_class
  WHEN 'VIA DISTRIBUIDORA PRINCIPAL' THEN 'PRIMARY'::street_road_class
  WHEN 'VÍA DISTRIBUIDORA COMPLEMENTARIA' THEN 'SECONDARY'::street_road_class
  WHEN 'VIA DISTRIBUIDORA COMPLEMENTARIA' THEN 'SECONDARY'::street_road_class
  WHEN 'VÍA LOCAL' THEN 'LOCAL'::street_road_class
  WHEN 'VIA LOCAL' THEN 'LOCAL'::street_road_class
  ELSE 'UNKNOWN'::street_road_class
END;
