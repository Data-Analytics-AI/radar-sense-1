CREATE TABLE IF NOT EXISTS "rule_simulations" (
        "id" text PRIMARY KEY NOT NULL,
        "rule_id" text,
        "performed_by" text DEFAULT 'system' NOT NULL,
        "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
        "sample_size" integer DEFAULT 0 NOT NULL,
        "match_count" integer DEFAULT 0 NOT NULL,
        "hit_rate" real DEFAULT 0 NOT NULL,
        "condition_group" jsonb,
        "sample_matches" jsonb DEFAULT '[]'::jsonb NOT NULL,
        "notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule_simulations" ADD CONSTRAINT "rule_simulations_rule_id_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_simulations_rule_idx" ON "rule_simulations" ("rule_id");
