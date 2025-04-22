CREATE TABLE "investigators" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"facility" text,
	"city" text,
	"state" text,
	"zip" text,
	"affiliation" text,
	"nct_id" text,
	"start_date" date,
	"inserted_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "investigators_nct_id_idx" ON "investigators" USING btree ("nct_id");