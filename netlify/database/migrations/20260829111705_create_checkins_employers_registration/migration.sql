CREATE TABLE "checkins" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"code" text,
	"phone" text,
	"type" text NOT NULL,
	"position" text DEFAULT '',
	"company" text DEFAULT '',
	"matched_employer" text,
	"matched_position" text,
	"checkin_time" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employer_openings" (
	"id" serial PRIMARY KEY,
	"employer_id" integer NOT NULL,
	"position" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employers" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "registration_counts" (
	"kind" text PRIMARY KEY,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employer_openings" ADD CONSTRAINT "employer_openings_employer_id_employers_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employers"("id");