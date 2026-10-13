CREATE TABLE "rate_limit_windows" (
	"key" varchar(64) PRIMARY KEY NOT NULL,
	"count" bigint NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limit_windows_expires_at_idx" ON "rate_limit_windows" USING btree ("expires_at");