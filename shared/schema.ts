import { pgTable, text, integer, real, boolean, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================================================
// Customers (unified KYC + KYB; type discriminator + JSONB for variant fields)
// ============================================================================

export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // 'individual' | 'business'
  displayName: text("display_name").notNull(),
  // Identity (individual)
  fullName: text("full_name"),
  dob: text("dob"),
  gender: text("gender"),
  bvn: text("bvn"),
  nin: text("nin"),
  idType: text("id_type"),
  idNumber: text("id_number"),
  // Identity (business)
  companyName: text("company_name"),
  cacNumber: text("cac_number"),
  tin: text("tin"),
  industry: text("industry"),
  registrationDate: text("registration_date"),
  // Shared
  email: text("email"),
  phone: text("phone"),
  address: jsonb("address").$type<{ street: string; city: string; state: string; country: string; geo?: { lat: number; lng: number } } | null>(),
  accountNumber: text("account_number"),
  occupation: text("occupation"),
  sourceOfFunds: text("source_of_funds"),
  expectedMonthlyVolume: integer("expected_monthly_volume").notNull().default(0),
  expectedTransactionTypes: text("expected_transaction_types").array().notNull().default([]),
  totalTransactions: integer("total_transactions").notNull().default(0),
  totalVolume: real("total_volume").notNull().default(0),
  channelUsage: jsonb("channel_usage").$type<{ web: number; mobile: number; pos: number; atm: number; branch: number } | null>(),
  // Risk / KYC
  faceMatchScore: integer("face_match_score"),
  identityConfidenceScore: integer("identity_confidence_score").notNull().default(0),
  kycStatus: text("kyc_status").notNull().default("pending"),
  riskLevel: text("risk_level").notNull().default("low"),
  pepFlag: boolean("pep_flag").notNull().default(false),
  sanctionFlag: boolean("sanction_flag").notNull().default(false),
  fraudRiskFlag: boolean("fraud_risk_flag").notNull().default(false),
  eddStatus: text("edd_status").notNull().default("not_required"),
  // Business-only nested
  directors: jsonb("directors").$type<Array<{ name: string; bvn: string; position: string; shareholdingPct: number; pepFlag: boolean }>>().notNull().default([]),
  ubos: jsonb("ubos").$type<Array<{ name: string; bvn: string; ownershipPct: number; pepFlag: boolean }>>().notNull().default([]),
  // Timestamps
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }).notNull().defaultNow(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byType: index("customers_type_idx").on(t.type),
  byKyc: index("customers_kyc_idx").on(t.kycStatus),
  byRisk: index("customers_risk_idx").on(t.riskLevel),
}));

export const customerDocuments = pgTable("customer_documents", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  verified: boolean("verified").notNull().default(false),
  url: text("url"),
  // OBS storage key for the uploaded artifact (namespace `customer-documents/...`).
  // Files are uploaded directly to Huawei OBS via presigned PUT URLs and only the
  // key is persisted here. Signed GET URLs are minted on demand for viewing.
  storageKey: text("storage_key"),
  // Legacy: previously held base64 data URLs inlined in the DB. Kept nullable so
  // existing rows still load; new uploads must use `storageKey` instead.
  dataUrl: text("data_url"),
  size: integer("size"),
  mime: text("mime"),
}, (t) => ({
  byCustomer: index("customer_documents_customer_idx").on(t.customerId),
}));

// ============================================================================
// Screening / Compliance
// ============================================================================

export const screeningMatches = pgTable("screening_matches", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  customerType: text("customer_type").notNull(),
  screeningType: text("screening_type").notNull(),
  matchedName: text("matched_name").notNull(),
  matchedListSource: text("matched_list_source").notNull(),
  confidence: integer("confidence").notNull(),
  matchType: text("match_type").notNull(),
  jurisdiction: text("jurisdiction").notNull(),
  positionOrRole: text("position_or_role"),
  status: text("status").notNull().default("open"),
  detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedBy: text("reviewed_by"),
  notes: text("notes"),
  actionRequired: boolean("action_required").notNull().default(true),
  details: text("details").notNull().default(""),
}, (t) => ({
  byCustomer: index("screening_matches_customer_idx").on(t.customerId),
  byType: index("screening_matches_type_idx").on(t.screeningType),
}));

export const regulatoryReports = pgTable("regulatory_reports", {
  id: text("id").primaryKey(),
  type: text("type").notNull(), // STR | CTR
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  customerType: text("customer_type").notNull(),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("NGN"),
  transactionIds: text("transaction_ids").array().notNull().default([]),
  reason: text("reason").notNull(),
  narrative: text("narrative").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
  submittedBy: text("submitted_by"),
  preparedBy: text("prepared_by").notNull(),
  reviewedBy: text("reviewed_by"),
  attachments: integer("attachments").notNull().default(0),
  flagsTriggered: text("flags_triggered").array().notNull().default([]),
  jurisdiction: text("jurisdiction").notNull().default("NG"),
  regulatoryRef: text("regulatory_ref"),
}, (t) => ({
  byCustomer: index("regulatory_reports_customer_idx").on(t.customerId),
  byType: index("regulatory_reports_type_idx").on(t.type),
}));

export const fraudRegister = pgTable("fraud_register", {
  id: text("id").primaryKey(),
  incidentDate: timestamp("incident_date", { withTimezone: true }).notNull(),
  reportedDate: timestamp("reported_date", { withTimezone: true }).notNull(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  accountNumber: text("account_number").notNull(),
  fraudType: text("fraud_type").notNull(),
  channel: text("channel").notNull(),
  amountLost: real("amount_lost").notNull().default(0),
  amountSaved: real("amount_saved").notNull().default(0),
  amountRecovered: real("amount_recovered").notNull().default(0),
  status: text("status").notNull().default("open"),
  description: text("description").notNull(),
  perpetrator: text("perpetrator"),
  linkedAccounts: text("linked_accounts").array().notNull().default([]),
  linkedCases: text("linked_cases").array().notNull().default([]),
  resolutionNotes: text("resolution_notes"),
  reportedToCbn: boolean("reported_to_cbn").notNull().default(false),
  reportedToNibss: boolean("reported_to_nibss").notNull().default(false),
  reportedToNfiu: boolean("reported_to_nfiu").notNull().default(false),
  assignedTo: text("assigned_to").notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  timeline: jsonb("timeline").$type<Array<{ id: string; type: string; title: string; description?: string; performedBy: string; timestamp: string }>>().notNull().default([]),
}, (t) => ({
  byCustomer: index("fraud_register_customer_idx").on(t.customerId),
}));

export const eddCases = pgTable("edd_cases", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  triggerReason: text("trigger_reason").array().notNull().default([]),
  status: text("status").notNull().default("required"),
  riskFactors: text("risk_factors").array().notNull().default([]),
  sourceOfWealth: text("source_of_wealth").notNull(),
  documentsRequired: text("documents_required").array().notNull().default([]),
  documentsCollected: text("documents_collected").array().notNull().default([]),
  approvalChain: jsonb("approval_chain").$type<Array<{ role: string; name: string; status: 'pending' | 'approved' | 'rejected'; timestamp?: string; notes?: string }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp("due_date", { withTimezone: true }).notNull(),
  notes: text("notes").notNull().default(""),
}, (t) => ({
  byCustomer: index("edd_cases_customer_idx").on(t.customerId),
}));

// ============================================================================
// Alerts / Cases / Transactions
// ============================================================================

export const alerts = pgTable("alerts", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  transactionId: text("transaction_id").notNull().default("-"),
  customerId: text("customer_id").notNull(),
  riskScore: integer("risk_score").notNull().default(0),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("open"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  resolution: text("resolution").notNull().default("pending"),
  contributingFactors: text("contributing_factors").array().notNull().default([]),
  modelVersion: text("model_version").notNull().default(""),
  ruleIds: text("rule_ids").array().notNull().default([]),
  description: text("description").notNull().default(""),
  notes: jsonb("notes").$type<unknown[]>().notNull().default([]),
}, (t) => ({
  byCustomer: index("alerts_customer_idx").on(t.customerId),
  byStatus: index("alerts_status_idx").on(t.status),
}));

export const cases = pgTable("cases", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  alertIds: text("alert_ids").array().notNull().default([]),
  transactionIds: text("transaction_ids").array().notNull().default([]),
  customerId: text("customer_id").notNull(),
  assignedTo: text("assigned_to"),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  dueDate: timestamp("due_date", { withTimezone: true }),
  resolution: jsonb("resolution"),
  tags: text("tags").array().notNull().default([]),
  notes: jsonb("notes").$type<unknown[]>().notNull().default([]),
  timeline: jsonb("timeline").$type<unknown[]>().notNull().default([]),
  linkedEntities: jsonb("linked_entities").$type<unknown[]>().notNull().default([]),
  evidence: jsonb("evidence").$type<unknown[]>().notNull().default([]),
  description: text("description"),
}, (t) => ({
  byCustomer: index("cases_customer_idx").on(t.customerId),
  byStatus: index("cases_status_idx").on(t.status),
}));

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  accountId: text("account_id").notNull().default(""),
  amount: real("amount").notNull(),
  currency: text("currency").notNull().default("NGN"),
  type: text("type").notNull().default("mobile"),
  merchantId: text("merchant_id").notNull().default(""),
  merchantName: text("merchant_name").notNull().default(""),
  merchantCategoryCode: text("mcc").notNull().default(""),
  channel: text("channel").notNull().default("mobile"),
  deviceId: text("device_id").notNull().default(""),
  ipAddress: text("ip_address").notNull().default(""),
  geoLocation: jsonb("geo_location").$type<{ latitude: number; longitude: number; country: string; city: string } | null>(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  cardNumberMasked: text("card_number_masked").notNull().default(""),
  status: text("status").notNull().default("completed"),
  beneficiaryId: text("beneficiary_id"),
  beneficiaryAccount: text("beneficiary_account"),
  description: text("description").notNull().default(""),
  riskScore: integer("risk_score").notNull().default(0),
  riskLevel: text("risk_level").notNull().default("low"),
  mlProbability: real("ml_probability").notNull().default(0),
  anomalyScore: real("anomaly_score").notNull().default(0),
  rulesTriggered: text("rules_triggered").array().notNull().default([]),
}, (t) => ({
  byCustomer: index("transactions_customer_idx").on(t.customerId),
}));

// ============================================================================
// IAM Users
// ============================================================================

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull().default("viewer"),
  avatar: text("avatar"),
  isActive: boolean("is_active").notNull().default(true),
  // Extended IAM
  roles: text("roles").array().notNull().default([]),
  privilegeLevel: text("privilege_level").notNull().default("standard"),
  status: text("status").notNull().default("active"),
  department: text("department").notNull().default(""),
  team: text("team").notNull().default(""),
  title: text("title").notNull().default(""),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  ssoProvider: text("sso_provider").notNull().default("none"),
  authMethod: text("auth_method").notNull().default("local"),
  lastLogin: timestamp("last_login", { withTimezone: true }),
  lastLoginIp: text("last_login_ip"),
  lastLoginLocation: text("last_login_location"),
  lastLoginDevice: text("last_login_device"),
  lastActivity: timestamp("last_activity", { withTimezone: true }),
  lastActivityAction: text("last_activity_action"),
  failedLogins24h: integer("failed_logins_24h").notNull().default(0),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sessions: jsonb("sessions").$type<unknown[]>().notNull().default([]),
  auditLog: jsonb("audit_log").$type<unknown[]>().notNull().default([]),
  approvals: jsonb("approvals").$type<unknown[]>().notNull().default([]),
  // Local-auth password hash (scrypt). Null for SSO-only or unprovisioned accounts.
  passwordHash: text("password_hash"),
  passwordUpdatedAt: timestamp("password_updated_at", { withTimezone: true }),
});

// ============================================================================
// Roles, Role Assignments, Audit Log
// ============================================================================

export const roles = pgTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  label: text("label").notNull().default(""),
  description: text("description").notNull().default(""),
  privilegeLevel: text("privilege_level").notNull().default("standard"),
  permissionKeys: text("permission_keys").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userRoleAssignments = pgTable("user_role_assignments", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  roleId: text("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  assignedBy: text("assigned_by"),
}, (t) => ({
  byUser: index("user_role_assignments_user_idx").on(t.userId),
  byRole: index("user_role_assignments_role_idx").on(t.roleId),
}));

export const auditLog = pgTable("audit_log", {
  id: text("id").primaryKey(),
  actorUserId: text("actor_user_id"),
  actorName: text("actor_name").notNull().default("system"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull().default(""),
  targetId: text("target_id").notNull().default(""),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byActor: index("audit_log_actor_idx").on(t.actorUserId),
  byTarget: index("audit_log_target_idx").on(t.targetType, t.targetId),
  byCreatedAt: index("audit_log_created_at_idx").on(t.createdAt),
}));

// ============================================================================
// Customer activity (replacement for the localStorage actions store)
// ============================================================================

export const customerActions = pgTable("customer_actions", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
  actor: text("actor").notNull().default("system"),
  action: text("action").notNull(),
  note: text("note"),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byCustomer: index("customer_actions_customer_idx").on(t.customerId),
}));

// ============================================================================
// Rules / Models (kept thin — full migration in follow-up tasks)
// ============================================================================

export const rules = pgTable("rules", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  type: text("type").notNull(),
  category: text("category").notNull(),
  conditionGroup: jsonb("condition_group").$type<unknown>(),
  actions: jsonb("actions").$type<unknown[]>().notNull().default([]),
  severity: text("severity").notNull().default("medium"),
  condition: text("condition").notNull().default(""),
  threshold: real("threshold").notNull().default(0),
  priority: integer("priority").notNull().default(50),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  triggeredCount: integer("triggered_count").notNull().default(0),
  versions: jsonb("versions").$type<unknown[]>().notNull().default([]),
  auditLog: jsonb("audit_log").$type<unknown[]>().notNull().default([]),
  currentVersion: integer("current_version").notNull().default(1),
});

export const ruleSimulations = pgTable("rule_simulations", {
  id: text("id").primaryKey(),
  ruleId: text("rule_id").references(() => rules.id, { onDelete: "cascade" }),
  performedBy: text("performed_by").notNull().default("system"),
  performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
  sampleSize: integer("sample_size").notNull().default(0),
  matchCount: integer("match_count").notNull().default(0),
  hitRate: real("hit_rate").notNull().default(0),
  conditionGroup: jsonb("condition_group").$type<unknown>(),
  sampleMatches: jsonb("sample_matches").$type<unknown[]>().notNull().default([]),
  notes: text("notes").notNull().default(""),
}, (t) => ({
  byRule: index("rule_simulations_rule_idx").on(t.ruleId),
}));

// ============================================================================
// Model Management (registry + per-model evaluation snapshot)
// ============================================================================

export const models = pgTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  version: text("version").notNull(),
  stage: text("stage").notNull().default("candidate"),
  healthStatus: text("health_status").notNull().default("healthy"),
  purpose: text("purpose").notNull().default("fraud"),
  category: text("category").notNull().default("supervised"),
  owner: text("owner").notNull().default(""),
  description: text("description").notNull().default(""),
  objective: text("objective").notNull().default(""),
  dataWindow: text("data_window").notNull().default(""),
  trainedAt: timestamp("trained_at", { withTimezone: true }).notNull().defaultNow(),
  lastDeployed: timestamp("last_deployed", { withTimezone: true }),
  trainingDataSize: integer("training_data_size").notNull().default(0),
  featuresUsed: text("features_used").array().notNull().default([]),
  featureGroups: text("feature_groups").array().notNull().default([]),
  primarySegments: jsonb("primary_segments").$type<{ channels: string[]; countries: string[] }>().notNull().default({ channels: [], countries: [] }),
  labelRate: real("label_rate").notNull().default(0),
  limitations: text("limitations").array().notNull().default([]),
  knownFailureModes: text("known_failure_modes").array().notNull().default([]),
  threshold: real("threshold").notNull().default(0.5),
  riskBandMapping: jsonb("risk_band_mapping").$type<{ low: [number, number]; medium: [number, number]; high: [number, number]; critical: [number, number] }>().notNull(),
  metrics: jsonb("metrics").$type<{ accuracy: number; precision: number; recall: number; f1Score: number; aucRoc: number; falsePositiveRate: number; truePositiveRate: number }>().notNull(),
  latencyP50: integer("latency_p50").notNull().default(0),
  latencyP95: integer("latency_p95").notNull().default(0),
  errorRate: real("error_rate").notNull().default(0),
  uptime: real("uptime").notNull().default(0),
  throughput: integer("throughput").notNull().default(0),
  driftScore: real("drift_score").notNull().default(0),
  alertYield: real("alert_yield").notNull().default(0),
  inferenceVolume: integer("inference_volume").notNull().default(0),
  alertsGenerated: integer("alerts_generated").notNull().default(0),
  escalationRate: real("escalation_rate").notNull().default(0),
  confirmedFraudRate: real("confirmed_fraud_rate").notNull().default(0),
  isActive: boolean("is_active").notNull().default(false),
  approvalChain: jsonb("approval_chain").$type<Array<{ role: string; name: string; action: string; date: string }>>().notNull().default([]),
  versions: jsonb("versions").$type<Array<{ version: string; stage: string; trainedAt: string; metrics: { precision: number; recall: number; f1Score: number; aucRoc: number } }>>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byStage: index("models_stage_idx").on(t.stage),
  byCategory: index("models_category_idx").on(t.category),
}));

export const modelEvaluations = pgTable("model_evaluations", {
  id: text("id").primaryKey(),
  modelId: text("model_id").notNull().references(() => models.id, { onDelete: "cascade" }),
  featureDrift: jsonb("feature_drift").$type<Array<{ feature: string; psi: number; ksStatistic: number; status: "stable" | "warning" | "critical" }>>().notNull().default([]),
  dataQuality: jsonb("data_quality").$type<Array<{ metric: string; value: number; threshold: number; status: "pass" | "warning" | "fail" }>>().notNull().default([]),
  confusionMatrix: jsonb("confusion_matrix").$type<{ truePositive: number; falsePositive: number; trueNegative: number; falseNegative: number }>().notNull(),
  detectionTrend: jsonb("detection_trend").$type<Array<{ date: string; detections: number; falsePositives: number }>>().notNull().default([]),
  lossTrend: jsonb("loss_trend").$type<Array<{ month: string; prevented: number; actual: number }>>().notNull().default([]),
  scoreDistribution: jsonb("score_distribution").$type<Array<{ band: string; count: number; pct: number }>>().notNull().default([]),
  precisionRecallCurve: jsonb("precision_recall_curve").$type<Array<{ threshold: string; precision: number; recall: number }>>().notNull().default([]),
  featureImportance: jsonb("feature_importance").$type<Array<{ feature: string; importance: number; direction: "positive" | "negative" }>>().notNull().default([]),
  segmentMetrics: jsonb("segment_metrics").$type<Array<{ segment: string; precision: number; recall: number; f1Score: number; volume: number }>>().notNull().default([]),
  stabilityTrend: jsonb("stability_trend").$type<Array<{ week: string; confidence: number; calibration: number }>>().notNull().default([]),
  inferenceByChannel: jsonb("inference_by_channel").$type<Array<{ channel: string; volume: number; pct: number }>>().notNull().default([]),
  whatChanged: text("what_changed").array().notNull().default([]),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byModel: index("model_evaluations_model_idx").on(t.modelId),
}));

// ============================================================================
// AI chat sessions (metadata in DB; full message JSON in OBS)
// ============================================================================

export const chatSessions = pgTable("chat_sessions", {
  id: text("id").primaryKey(),
  ownerUserId: text("owner_user_id"),
  ownerName: text("owner_name").notNull().default("anonymous"),
  title: text("title").notNull().default("New chat"),
  storageKey: text("storage_key").notNull(),
  storageBackend: text("storage_backend").notNull().default("memory"),
  messageCount: integer("message_count").notNull().default(0),
  lastMessagePreview: text("last_message_preview").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byOwner: index("chat_sessions_owner_idx").on(t.ownerUserId),
  byUpdated: index("chat_sessions_updated_idx").on(t.updatedAt),
}));

// ============================================================================
// Report artifacts (generated PDFs/XML stored in OBS)
// ============================================================================

export const reportArtifacts = pgTable("report_artifacts", {
  id: text("id").primaryKey(),
  reportId: text("report_id").notNull().references(() => regulatoryReports.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // PDF | XML
  version: integer("version").notNull().default(1),
  storageKey: text("storage_key").notNull(),
  storageBackend: text("storage_backend").notNull().default("memory"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  mime: text("mime").notNull().default("application/pdf"),
  createdBy: text("created_by").notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byReport: index("report_artifacts_report_idx").on(t.reportId),
}));

// ============================================================================
// Zod insert schemas + types
// ============================================================================

export const insertCustomerSchema = createInsertSchema(customers).omit({
  onboardedAt: true,
  lastReviewedAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type CustomerRow = typeof customers.$inferSelect;

export const insertCustomerDocumentSchema = createInsertSchema(customerDocuments).omit({ uploadedAt: true });
export type InsertCustomerDocument = z.infer<typeof insertCustomerDocumentSchema>;
export type CustomerDocumentRow = typeof customerDocuments.$inferSelect;

export const insertScreeningMatchSchema = createInsertSchema(screeningMatches).omit({ detectedAt: true });
export type InsertScreeningMatch = z.infer<typeof insertScreeningMatchSchema>;
export type ScreeningMatchRow = typeof screeningMatches.$inferSelect;

export const insertRegulatoryReportSchema = createInsertSchema(regulatoryReports).omit({ createdAt: true });
export type InsertRegulatoryReport = z.infer<typeof insertRegulatoryReportSchema>;
export type RegulatoryReportRow = typeof regulatoryReports.$inferSelect;

export const insertFraudRegisterSchema = createInsertSchema(fraudRegister);
export type InsertFraudRegister = z.infer<typeof insertFraudRegisterSchema>;
export type FraudRegisterRow = typeof fraudRegister.$inferSelect;

export const insertEddCaseSchema = createInsertSchema(eddCases).omit({ createdAt: true });
export type InsertEddCase = z.infer<typeof insertEddCaseSchema>;
export type EddCaseRow = typeof eddCases.$inferSelect;

export const insertAlertSchema = createInsertSchema(alerts).omit({ createdAt: true, updatedAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type AlertRow = typeof alerts.$inferSelect;

export const insertCaseSchema = createInsertSchema(cases).omit({ createdAt: true, updatedAt: true });
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type CaseRow = typeof cases.$inferSelect;

export const insertTransactionSchema = createInsertSchema(transactions).omit({ timestamp: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type TransactionRow = typeof transactions.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({ createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type UserRow = typeof users.$inferSelect;

export const insertCustomerActionSchema = createInsertSchema(customerActions).omit({ createdAt: true, id: true });
export type InsertCustomerAction = z.infer<typeof insertCustomerActionSchema>;
export type CustomerActionRow = typeof customerActions.$inferSelect;

export const insertRuleSchema = createInsertSchema(rules).omit({ createdAt: true, updatedAt: true });
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type RuleRow = typeof rules.$inferSelect;

export const insertRuleSimulationSchema = createInsertSchema(ruleSimulations).omit({ performedAt: true, id: true });
export type InsertRuleSimulation = z.infer<typeof insertRuleSimulationSchema>;
export type RuleSimulationRow = typeof ruleSimulations.$inferSelect;

export const insertRoleSchema = createInsertSchema(roles).omit({ createdAt: true, updatedAt: true });
export type InsertRole = z.infer<typeof insertRoleSchema>;
export type RoleRow = typeof roles.$inferSelect;

export const insertUserRoleAssignmentSchema = createInsertSchema(userRoleAssignments).omit({ assignedAt: true, id: true });
export type InsertUserRoleAssignment = z.infer<typeof insertUserRoleAssignmentSchema>;
export type UserRoleAssignmentRow = typeof userRoleAssignments.$inferSelect;

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ createdAt: true, id: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLogRow = typeof auditLog.$inferSelect;

export const insertChatSessionSchema = createInsertSchema(chatSessions).omit({ createdAt: true, updatedAt: true });
export type InsertChatSession = z.infer<typeof insertChatSessionSchema>;
export type ChatSessionRow = typeof chatSessions.$inferSelect;

export const insertReportArtifactSchema = createInsertSchema(reportArtifacts).omit({ createdAt: true });
export type InsertReportArtifact = z.infer<typeof insertReportArtifactSchema>;
export type ReportArtifactRow = typeof reportArtifacts.$inferSelect;

export const insertModelSchema = createInsertSchema(models).omit({ createdAt: true, updatedAt: true });
export type InsertModel = z.infer<typeof insertModelSchema>;
export type ModelRow = typeof models.$inferSelect;

export const insertModelEvaluationSchema = createInsertSchema(modelEvaluations).omit({ generatedAt: true });
export type InsertModelEvaluation = z.infer<typeof insertModelEvaluationSchema>;
export type ModelEvaluationRow = typeof modelEvaluations.$inferSelect;

// ============================================================================
// Dashboard aggregate payloads (computed server-side from live tables)
// ============================================================================

export interface DashboardKpiCard {
  label: string;
  value: string | number;
  subtitle: string;
  trend: { value: number; label: string };
  details: Record<string, string | number>;
  variant: "default" | "success" | "warning" | "danger";
}

export interface RiskPyramidTier {
  tier: "Critical" | "High" | "Medium" | "Low";
  count: number;
  exposure: number;
  pct: number;
}

export interface DashboardKpisPayload {
  cards: DashboardKpiCard[];
  riskPyramid: RiskPyramidTier[];
  generatedAt: string;
}

export interface ChannelBreakdownEntry {
  channel: string;
  volume: number;
  pct: number;
  fraud: number;
}

export interface TxnVolumeBucket {
  date: string;
  label: string;
  total: number;
  pos: number;
  web: number;
  mobile: number;
  atm: number;
  branch: number;
  fraudMarkers: number;
}

export interface FraudTrendPoint {
  date: string;
  actual: number;
  expected: number;
  prediction: number | null;
  isAnomaly: boolean;
}

export interface DashboardTrendsPayload {
  window: "24h" | "7d" | "30d";
  channelBreakdown: ChannelBreakdownEntry[];
  txnVolume7d: TxnVolumeBucket[];
  fraudTrend30d: FraudTrendPoint[];
}

export type GraphRiskBand = "low" | "medium" | "high" | "critical";
export type GraphRelationshipType =
  | "sent_money"
  | "shared_device"
  | "shared_ip"
  | "shared_address"
  | "common_beneficiary"
  | "linked_account";

export interface GraphNetworkNode {
  id: string;
  label: string;
  type: "customer" | "account" | "device" | "merchant";
  risk: GraphRiskBand;
  x: number;
  y: number;
  connections: number;
  transactions30d: number;
  totalAmount: number;
  openCases: number;
  riskScore: number;
  alerts: number;
  jurisdiction: string;
  velocity: number;
}

export interface GraphNetworkEdge {
  from: string;
  to: string;
  relationshipType: GraphRelationshipType;
  txnCount: number;
  totalAmount: number;
  riskScore: number;
  isRecent: boolean;
}

export interface GraphNetworkKpis {
  totalNodes: number;
  totalEdges: number;
  highRiskPct: number;
  sharedDeviceEdges: number;
  crossBorderEdges: number;
  velocitySpikes: number;
}

export interface GraphNetworkPayload {
  nodes: GraphNetworkNode[];
  edges: GraphNetworkEdge[];
  kpis: GraphNetworkKpis;
  truncated: boolean;
  generatedAt: string;
}

export interface ComplianceSnapshotPayload {
  verifiedCustomers: number;
  unverifiedCustomers: number;
  highRiskCustomers: number;
  pepMatches: number;
  sanctionsMatches: number;
  strSubmittedThisMonth: number;
  strPending: number;
  strOverdue: number;
  ctrFlags: number;
  fraudLossYtd: number;
  fraudPreventedYtd: number;
  eddOpen: number;
  eddOverdue: number;
}

// ============================================================================
// Analytics aggregate payloads (Analytics page; /api/analytics/:tab)
// ============================================================================

export interface AnalyticsKpi { value: number | string; delta: number; definition: string; }
export type AnalyticsTimeRange = "24h" | "7d" | "30d" | "90d";
export type AnalyticsChannel = "all" | "pos" | "web" | "mobile" | "atm" | "branch";
export interface AnalyticsFiltersInput {
  timeRange: AnalyticsTimeRange;
  channel: AnalyticsChannel;
  country: string; // 'all' or ISO-2 like 'US'
}

export interface AnalyticsExecutivePayload {
  insights: { severity: "info" | "warning" | "critical"; text: string; metric: string; evidence: string }[];
  recommendedActions: { text: string; linkTo: string; priority: "high" | "medium" | "low" }[];
}

export interface AnalyticsFraudPayload {
  detectionRate: AnalyticsKpi; preventedValue: AnalyticsKpi; confirmedLoss: AnalyticsKpi;
  falsePositiveRate: AnalyticsKpi; avgTimeToDetect: AnalyticsKpi; avgTimeToContain: AnalyticsKpi;
  fraudTrend: { month: string; detected: number; prevented: number; actualLoss: number }[];
  alertFunnel: { flagged: number; reviewed: number; escalated: number; confirmedFraud: number; sarFiled: number };
  topTypologies: { name: string; count: number; value: number; trend: number }[];
  topDriverRules: { name: string; confirmedFraud: number; triggers: number }[];
  riskyMerchants: { id: string; name: string; riskScore: number; volume: number; confirmedFraud: number; country: string }[];
  riskyCustomers: { id: string; name: string; riskScore: number; flags: string[]; linkedCases: number }[];
  riskyDevices: { id: string; type: string; trustLevel: number; geoMismatch: boolean; lastSeen: string }[];
}

export interface AnalyticsAmlPayload {
  alertCount: AnalyticsKpi; escalations: AnalyticsKpi; sarsFiled: AnalyticsKpi;
  avgEscalationTime: AnalyticsKpi; structuringCount: AnalyticsKpi; sanctionsHits: AnalyticsKpi;
  amlTrend: { month: string; alerts: number; escalations: number; sarsFiled: number }[];
  typologyDistribution: { name: string; count: number; percentage: number }[];
  sarPipeline: { drafted: number; reviewed: number; approved: number; filed: number };
  highRiskCustomers: { id: string; name: string; riskScore: number; typologyTags: string[]; exposure: number }[];
  counterpartyRisk: { id: string; name: string; exposure: number; country: string; riskLevel: string }[];
}

export interface AnalyticsModelsPayload {
  precision: AnalyticsKpi; recall: AnalyticsKpi; f1: AnalyticsKpi; auc: AnalyticsKpi;
  featureDrift: AnalyticsKpi; predictionDrift: AnalyticsKpi; dataQuality: AnalyticsKpi;
  latencyP50: AnalyticsKpi; latencyP95: AnalyticsKpi; modelVersion: AnalyticsKpi;
  performanceComparison: { name: string; precision: number; recall: number; f1: number; auc: number }[];
  driftTrend: { month: string; featureDrift: number; predictionDrift: number }[];
  scoreDistribution: { bucket: string; count: number }[];
  confusionMatrix: { tp: number; fp: number; tn: number; fn: number };
}

export interface AnalyticsRulesPayload {
  totalTriggers: AnalyticsKpi; confirmedFraudRate: AnalyticsKpi; noiseRate: AnalyticsKpi;
  avgTimeToReview: AnalyticsKpi; lastTunedDate: AnalyticsKpi;
  rulesTable: { id: string; name: string; category: string; triggerCount: number; trueFraudPct: number; noisePct: number; netValuePrevented: number; lastUpdated: string; status: string; triggerTrend: number[] }[];
}

export interface AnalyticsGeographyPayload {
  countries: { code: string; name: string; txnVolume: number; alertRate: number; fraudRate: number; amlRiskScore: number; topMerchant: string; topChannel: string }[];
  geoAnomalies: { ipMismatchRate: number; impossibleTravel: number; firstSeenCountry: number };
}

export interface AnalyticsChannelsPayload {
  channelVolume: { name: string; volume: number; risk: number; alertsPer1k: number; falsePositiveRate: number }[];
  channelRiskTrend: { month: string; pos: number; web: number; mobile: number; atm: number; branch: number }[];
  channelFunnel: { name: string; flagged: number; reviewed: number; confirmed: number }[];
}

export interface AnalyticsUsersPayload {
  totalUsers: AnalyticsKpi; activeUsers: AnalyticsKpi; privilegedUsers: AnalyticsKpi;
  mfaAdoption: AnalyticsKpi; ssoAdoption: AnalyticsKpi; failedLogins24h: AnalyticsKpi; lockedUsers: AnalyticsKpi;
  loginsTrend: { month: string; logins: number }[];
  failedLoginsTrend: { month: string; failed: number }[];
  analystProductivity: { name: string; casesHandled: number; avgReviewTime: number; slaBreaches: number }[];
  unusualAccess: { userId: string; name: string; pattern: string; exports: number; unusualTime: boolean; lastAction: string }[];
  roleDistribution: { role: string; count: number }[];
}

export interface AnalyticsOperationsPayload {
  openAlerts: AnalyticsKpi; openCases: AnalyticsKpi; slaBreachRisk: AnalyticsKpi;
  avgTimeToTriage: AnalyticsKpi; avgTimeToResolution: AnalyticsKpi; backlogTrend: AnalyticsKpi;
  backlogTrendData: { month: string; alerts: number; cases: number }[];
  slaComplianceTrend: { month: string; compliance: number }[];
  caseAging: { bucket: string; count: number }[];
  oldestCases: { id: string; title: string; age: number; assignee: string; priority: string }[];
  teamQueues: { team: string; open: number; inReview: number; breached: number }[];
}

export interface AnalyticsAuditPayload {
  auditEvents: { id: string; timestamp: string; user: string; action: string; target: string; details: string; correlationId: string; immutable: boolean }[];
}

export type AnalyticsTab =
  | "executive" | "fraud" | "aml" | "models" | "rules"
  | "geography" | "channels" | "users" | "operations" | "audit";

export interface AnalyticsTabPayloadMap {
  executive: AnalyticsExecutivePayload;
  fraud: AnalyticsFraudPayload;
  aml: AnalyticsAmlPayload;
  models: AnalyticsModelsPayload;
  rules: AnalyticsRulesPayload;
  geography: AnalyticsGeographyPayload;
  channels: AnalyticsChannelsPayload;
  users: AnalyticsUsersPayload;
  operations: AnalyticsOperationsPayload;
  audit: AnalyticsAuditPayload;
}
