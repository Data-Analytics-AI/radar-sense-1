CREATE TABLE "alerts" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"transaction_id" text DEFAULT '-' NOT NULL,
	"customer_id" text NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolution" text DEFAULT 'pending' NOT NULL,
	"contributing_factors" text[] DEFAULT '{}' NOT NULL,
	"model_version" text DEFAULT '' NOT NULL,
	"rule_ids" text[] DEFAULT '{}' NOT NULL,
	"description" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"alert_ids" text[] DEFAULT '{}' NOT NULL,
	"transaction_ids" text[] DEFAULT '{}' NOT NULL,
	"customer_id" text NOT NULL,
	"assigned_to" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone,
	"resolution" jsonb,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "customer_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"actor" text DEFAULT 'system' NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"url" text,
	"data_url" text,
	"size" integer,
	"mime" text
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"display_name" text NOT NULL,
	"full_name" text,
	"dob" text,
	"gender" text,
	"bvn" text,
	"nin" text,
	"id_type" text,
	"id_number" text,
	"company_name" text,
	"cac_number" text,
	"tin" text,
	"industry" text,
	"registration_date" text,
	"email" text,
	"phone" text,
	"address" jsonb,
	"account_number" text,
	"occupation" text,
	"source_of_funds" text,
	"expected_monthly_volume" integer DEFAULT 0 NOT NULL,
	"expected_transaction_types" text[] DEFAULT '{}' NOT NULL,
	"total_transactions" integer DEFAULT 0 NOT NULL,
	"total_volume" real DEFAULT 0 NOT NULL,
	"channel_usage" jsonb,
	"face_match_score" integer,
	"identity_confidence_score" integer DEFAULT 0 NOT NULL,
	"kyc_status" text DEFAULT 'pending' NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"pep_flag" boolean DEFAULT false NOT NULL,
	"sanction_flag" boolean DEFAULT false NOT NULL,
	"fraud_risk_flag" boolean DEFAULT false NOT NULL,
	"edd_status" text DEFAULT 'not_required' NOT NULL,
	"directors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ubos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"onboarded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "edd_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"trigger_reason" text[] DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'required' NOT NULL,
	"risk_factors" text[] DEFAULT '{}' NOT NULL,
	"source_of_wealth" text NOT NULL,
	"documents_required" text[] DEFAULT '{}' NOT NULL,
	"documents_collected" text[] DEFAULT '{}' NOT NULL,
	"approval_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_register" (
	"id" text PRIMARY KEY NOT NULL,
	"incident_date" timestamp with time zone NOT NULL,
	"reported_date" timestamp with time zone NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"account_number" text NOT NULL,
	"fraud_type" text NOT NULL,
	"channel" text NOT NULL,
	"amount_lost" real DEFAULT 0 NOT NULL,
	"amount_saved" real DEFAULT 0 NOT NULL,
	"amount_recovered" real DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"description" text NOT NULL,
	"perpetrator" text,
	"linked_accounts" text[] DEFAULT '{}' NOT NULL,
	"linked_cases" text[] DEFAULT '{}' NOT NULL,
	"resolution_notes" text,
	"reported_to_cbn" boolean DEFAULT false NOT NULL,
	"reported_to_nibss" boolean DEFAULT false NOT NULL,
	"reported_to_nfiu" boolean DEFAULT false NOT NULL,
	"assigned_to" text NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ml_models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"version" text NOT NULL,
	"trained_at" timestamp with time zone DEFAULT now() NOT NULL,
	"training_data_size" integer DEFAULT 0 NOT NULL,
	"features_used" text[] DEFAULT '{}' NOT NULL,
	"metrics" jsonb,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "regulatory_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_type" text NOT NULL,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"transaction_ids" text[] DEFAULT '{}' NOT NULL,
	"reason" text NOT NULL,
	"narrative" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"submitted_by" text,
	"prepared_by" text NOT NULL,
	"reviewed_by" text,
	"attachments" integer DEFAULT 0 NOT NULL,
	"flags_triggered" text[] DEFAULT '{}' NOT NULL,
	"jurisdiction" text DEFAULT 'NG' NOT NULL,
	"regulatory_ref" text
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" text NOT NULL,
	"category" text NOT NULL,
	"condition_group" jsonb,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"condition" text DEFAULT '' NOT NULL,
	"threshold" real DEFAULT 0 NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_count" integer DEFAULT 0 NOT NULL,
	"versions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audit_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screening_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_type" text NOT NULL,
	"screening_type" text NOT NULL,
	"matched_name" text NOT NULL,
	"matched_list_source" text NOT NULL,
	"confidence" integer NOT NULL,
	"match_type" text NOT NULL,
	"jurisdiction" text NOT NULL,
	"position_or_role" text,
	"status" text DEFAULT 'open' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" text,
	"notes" text,
	"action_required" boolean DEFAULT true NOT NULL,
	"details" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"account_id" text DEFAULT '' NOT NULL,
	"amount" real NOT NULL,
	"currency" text DEFAULT 'NGN' NOT NULL,
	"type" text DEFAULT 'mobile' NOT NULL,
	"merchant_id" text DEFAULT '' NOT NULL,
	"merchant_name" text DEFAULT '' NOT NULL,
	"mcc" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT 'mobile' NOT NULL,
	"device_id" text DEFAULT '' NOT NULL,
	"ip_address" text DEFAULT '' NOT NULL,
	"geo_location" jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"card_number_masked" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"beneficiary_id" text,
	"beneficiary_account" text,
	"description" text DEFAULT '' NOT NULL,
	"risk_score" integer DEFAULT 0 NOT NULL,
	"risk_level" text DEFAULT 'low' NOT NULL,
	"ml_probability" real DEFAULT 0 NOT NULL,
	"anomaly_score" real DEFAULT 0 NOT NULL,
	"rules_triggered" text[] DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"avatar" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"roles" text[] DEFAULT '{}' NOT NULL,
	"privilege_level" text DEFAULT 'standard' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"team" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"mfa_enabled" boolean DEFAULT false NOT NULL,
	"sso_provider" text DEFAULT 'none' NOT NULL,
	"auth_method" text DEFAULT 'local' NOT NULL,
	"last_login" timestamp with time zone,
	"last_login_ip" text,
	"last_login_location" text,
	"last_login_device" text,
	"last_activity" timestamp with time zone,
	"last_activity_action" text,
	"failed_logins_24h" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sessions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audit_log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"approvals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "customer_actions" ADD CONSTRAINT "customer_actions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edd_cases" ADD CONSTRAINT "edd_cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fraud_register" ADD CONSTRAINT "fraud_register_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regulatory_reports" ADD CONSTRAINT "regulatory_reports_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screening_matches" ADD CONSTRAINT "screening_matches_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_customer_idx" ON "alerts" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "alerts_status_idx" ON "alerts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_customer_idx" ON "cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "customer_actions_customer_idx" ON "customer_actions" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_documents_customer_idx" ON "customer_documents" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customers_type_idx" ON "customers" USING btree ("type");--> statement-breakpoint
CREATE INDEX "customers_kyc_idx" ON "customers" USING btree ("kyc_status");--> statement-breakpoint
CREATE INDEX "customers_risk_idx" ON "customers" USING btree ("risk_level");--> statement-breakpoint
CREATE INDEX "edd_cases_customer_idx" ON "edd_cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "fraud_register_customer_idx" ON "fraud_register" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "regulatory_reports_customer_idx" ON "regulatory_reports" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "regulatory_reports_type_idx" ON "regulatory_reports" USING btree ("type");--> statement-breakpoint
CREATE INDEX "screening_matches_customer_idx" ON "screening_matches" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "screening_matches_type_idx" ON "screening_matches" USING btree ("screening_type");--> statement-breakpoint
CREATE INDEX "transactions_customer_idx" ON "transactions" USING btree ("customer_id");