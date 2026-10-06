DROP INDEX "streets_source_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "streets_source_code_name_unique" ON "streets" USING btree ("source_code","normalized_name");