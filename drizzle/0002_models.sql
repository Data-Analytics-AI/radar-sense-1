-- Task #40: Model Management — registry + per-model evaluation snapshots.
-- The legacy `ml_models` table (never wired to routes/storage) is dropped to
-- make room for the new schema with full registry, drift, and evaluation
-- columns. Apply via: node scripts/apply-schema.mjs drizzle/0002_models.sql
DROP TABLE IF EXISTS "ml_models" CASCADE;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "models" (
  "id" text PRIMARY KEY,
  "name" text NOT NULL,
  "type" text NOT NULL,
  "version" text NOT NULL,
  "stage" text NOT NULL DEFAULT 'candidate',
  "health_status" text NOT NULL DEFAULT 'healthy',
  "purpose" text NOT NULL DEFAULT 'fraud',
  "category" text NOT NULL DEFAULT 'supervised',
  "owner" text NOT NULL DEFAULT '',
  "description" text NOT NULL DEFAULT '',
  "objective" text NOT NULL DEFAULT '',
  "data_window" text NOT NULL DEFAULT '',
  "trained_at" timestamp with time zone NOT NULL DEFAULT now(),
  "last_deployed" timestamp with time zone,
  "training_data_size" integer NOT NULL DEFAULT 0,
  "features_used" text[] NOT NULL DEFAULT '{}',
  "feature_groups" text[] NOT NULL DEFAULT '{}',
  "primary_segments" jsonb NOT NULL DEFAULT '{"channels":[],"countries":[]}'::jsonb,
  "label_rate" real NOT NULL DEFAULT 0,
  "limitations" text[] NOT NULL DEFAULT '{}',
  "known_failure_modes" text[] NOT NULL DEFAULT '{}',
  "threshold" real NOT NULL DEFAULT 0.5,
  "risk_band_mapping" jsonb NOT NULL,
  "metrics" jsonb NOT NULL,
  "latency_p50" integer NOT NULL DEFAULT 0,
  "latency_p95" integer NOT NULL DEFAULT 0,
  "error_rate" real NOT NULL DEFAULT 0,
  "uptime" real NOT NULL DEFAULT 0,
  "throughput" integer NOT NULL DEFAULT 0,
  "drift_score" real NOT NULL DEFAULT 0,
  "alert_yield" real NOT NULL DEFAULT 0,
  "inference_volume" integer NOT NULL DEFAULT 0,
  "alerts_generated" integer NOT NULL DEFAULT 0,
  "escalation_rate" real NOT NULL DEFAULT 0,
  "confirmed_fraud_rate" real NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT false,
  "approval_chain" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "versions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "models_stage_idx" ON "models" ("stage");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "models_category_idx" ON "models" ("category");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_evaluations" (
  "id" text PRIMARY KEY,
  "model_id" text NOT NULL REFERENCES "models"("id") ON DELETE CASCADE,
  "feature_drift" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "data_quality" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "confusion_matrix" jsonb NOT NULL,
  "detection_trend" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "loss_trend" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "score_distribution" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "precision_recall_curve" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "feature_importance" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "segment_metrics" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "stability_trend" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "inference_by_channel" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "what_changed" text[] NOT NULL DEFAULT '{}',
  "generated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "model_evaluations_model_idx" ON "model_evaluations" ("model_id");
