import { getStorage } from "./storage.js";
import { getPool } from "./db.js";
import {
  getCustomers, getScreeningMatches, getRegulatoryReports,
  getFraudRegister, getEddCases, getComplianceAlerts,
} from "../src/lib/compliance-data.js";
import { generateRules, generateTransactions, generateAlerts, generateCases, generateIAMUsers, generateRoleDefinitions, CANONICAL_DEMO_ACCOUNTS } from "../src/lib/mock-data.js";
import { generateModelSeeds } from "./models-fixtures.js";
import type {
  InsertCustomer, InsertCustomerDocument, InsertScreeningMatch,
  InsertRegulatoryReport, InsertFraudRegister, InsertEddCase, InsertAlert, InsertCase,
  InsertRule, InsertTransaction,
  InsertUser, InsertRole, InsertUserRoleAssignment,
  InsertModelEvaluation,
} from "../shared/schema.js";

/**
 * Idempotent forward-only schema patches that we apply at boot for columns added
 * after the initial migration baseline. Keeps deployments self-healing without
 * requiring an out-of-band drizzle-kit push.
 */
export async function ensureSchemaPatches(): Promise<void> {
  const pool = getPool();
  await pool.query(`ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "notes" jsonb NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE "fraud_register" ADD COLUMN IF NOT EXISTS "timeline" jsonb NOT NULL DEFAULT '[]'::jsonb`);
  // OBS storage key for KYC documents (task #31). Files now upload directly
  // to Huawei OBS; this column holds the resulting object key. The legacy
  // base64 `data_url` column stays nullable for backwards compatibility.
  await pool.query(`ALTER TABLE "customer_documents" ADD COLUMN IF NOT EXISTS "storage_key" text`);
  // Task #48: local-auth password hash columns on users.
  await pool.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text`);
  await pool.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_updated_at" timestamp with time zone`);
  // Task #33: AI chat sessions (metadata in DB, transcript JSON in OBS).
  await pool.query(`CREATE TABLE IF NOT EXISTS "chat_sessions" (
    "id" text PRIMARY KEY,
    "owner_user_id" text,
    "owner_name" text NOT NULL DEFAULT 'anonymous',
    "title" text NOT NULL DEFAULT 'New chat',
    "storage_key" text NOT NULL,
    "storage_backend" text NOT NULL DEFAULT 'memory',
    "message_count" integer NOT NULL DEFAULT 0,
    "last_message_preview" text NOT NULL DEFAULT '',
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "chat_sessions_owner_idx" ON "chat_sessions" ("owner_user_id")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "chat_sessions_updated_idx" ON "chat_sessions" ("updated_at")`);
  // Task #33: server-rendered regulatory report artifacts (PDF/XML in OBS).
  await pool.query(`CREATE TABLE IF NOT EXISTS "report_artifacts" (
    "id" text PRIMARY KEY,
    "report_id" text NOT NULL REFERENCES "regulatory_reports"("id") ON DELETE CASCADE,
    "kind" text NOT NULL,
    "version" integer NOT NULL DEFAULT 1,
    "storage_key" text NOT NULL,
    "storage_backend" text NOT NULL DEFAULT 'memory',
    "size_bytes" integer NOT NULL DEFAULT 0,
    "mime" text NOT NULL DEFAULT 'application/pdf',
    "created_by" text NOT NULL DEFAULT 'system',
    "created_at" timestamp with time zone NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "report_artifacts_report_idx" ON "report_artifacts" ("report_id")`);

  // Task #40: Model registry + per-model evaluation snapshots are managed by
  // a Drizzle migration (drizzle/0002_models.sql) that the post-merge setup
  // script applies via scripts/apply-schema.mjs. The block below only runs in
  // dev environments where the migration hasn't been applied yet — production
  // relies exclusively on the migration file.
  await pool.query(`DROP TABLE IF EXISTS "ml_models" CASCADE`);
  await pool.query(`CREATE TABLE IF NOT EXISTS "models" (
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
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "models_stage_idx" ON "models" ("stage")`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "models_category_idx" ON "models" ("category")`);

  await pool.query(`CREATE TABLE IF NOT EXISTS "model_evaluations" (
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
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS "model_evaluations_model_idx" ON "model_evaluations" ("model_id")`);
}

function toIsoDate(s?: string): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function customerToInsert(c: ReturnType<typeof getCustomers>[number]): InsertCustomer {
  if (c.type === "individual") {
    return {
      id: c.id,
      type: "individual",
      displayName: c.fullName,
      fullName: c.fullName,
      dob: c.dob,
      gender: c.gender,
      bvn: c.bvn,
      nin: c.nin ?? null,
      idType: c.idType,
      idNumber: c.idNumber,
      email: c.email,
      phone: c.phone,
      address: c.address,
      accountNumber: c.accountNumber,
      occupation: c.occupation,
      sourceOfFunds: c.sourceOfFunds,
      expectedMonthlyVolume: c.expectedMonthlyVolume,
      expectedTransactionTypes: c.expectedTransactionTypes,
      totalTransactions: c.totalTransactions,
      totalVolume: c.totalVolume,
      channelUsage: c.channelUsage,
      faceMatchScore: c.faceMatchScore,
      identityConfidenceScore: c.identityConfidenceScore,
      kycStatus: c.kycStatus,
      riskLevel: c.riskLevel,
      pepFlag: c.pepFlag,
      sanctionFlag: c.sanctionFlag,
      fraudRiskFlag: c.fraudRiskFlag,
      eddStatus: c.eddStatus,
      directors: [],
      ubos: [],
    } as unknown as InsertCustomer;
  }
  return {
    id: c.id,
    type: "business",
    displayName: c.companyName,
    companyName: c.companyName,
    cacNumber: c.cacNumber,
    tin: c.tin,
    industry: c.industry,
    registrationDate: c.registrationDate,
    email: c.contactEmail,
    phone: c.contactPhone,
    address: { ...c.businessAddress, geo: undefined },
    accountNumber: c.accountNumber,
    expectedMonthlyVolume: c.expectedMonthlyVolume,
    expectedTransactionTypes: c.expectedTransactionTypes,
    totalTransactions: c.totalTransactions,
    totalVolume: c.totalVolume,
    sourceOfFunds: c.sourceOfFunds,
    identityConfidenceScore: c.identityConfidenceScore,
    kycStatus: c.kycStatus,
    riskLevel: c.riskLevel,
    pepFlag: c.pepFlag,
    sanctionFlag: c.sanctionFlag,
    fraudRiskFlag: c.fraudRiskFlag,
    eddStatus: c.eddStatus,
    directors: c.directors,
    ubos: c.ubos,
  } as unknown as InsertCustomer;
}

/**
 * Per-table idempotent seed. Each table is checked independently so a
 * partial seed on a previous run can self-heal on the next boot.
 */
export async function seedDatabaseIfEmpty(): Promise<{ skipped: boolean; inserted: Record<string, number> }> {
  const storage = getStorage();
  const inserted: Record<string, number> = {};
  let didAnything = false;

  // 1. Customers
  if ((await storage.countCustomers()) === 0) {
    const customers = getCustomers();
    await storage.upsertCustomers(customers.map(customerToInsert));
    inserted.customers = customers.length;
    didAnything = true;
  }

  // 2. Documents
  if ((await storage.countCustomerDocuments()) === 0) {
    const docs: InsertCustomerDocument[] = getCustomers().flatMap(c =>
      c.documents.map(d => ({
        id: d.id,
        customerId: c.id,
        name: d.name,
        type: d.type,
        verified: d.verified,
        url: d.url ?? null,
        storageKey: d.storageKey ?? null,
        dataUrl: d.dataUrl ?? null,
        size: d.size ?? null,
        mime: d.mime ?? null,
      }))
    );
    if (docs.length > 0) {
      await storage.bulkInsertDocuments(docs);
      inserted.documents = docs.length;
      didAnything = true;
    }
  }

  // 3. Screening
  if ((await storage.countScreening()) === 0) {
    const screening = getScreeningMatches();
    const rows: InsertScreeningMatch[] = screening.map(s => ({
      ...s,
      detectedAt: toIsoDate(s.detectedAt) ?? new Date(),
      reviewedBy: s.reviewedBy ?? null,
      notes: s.notes ?? null,
      positionOrRole: s.positionOrRole ?? null,
    })) as unknown as InsertScreeningMatch[];
    await storage.bulkInsertScreening(rows);
    inserted.screening = rows.length;
    didAnything = true;
  }

  // 4. Regulatory reports
  if ((await storage.countRegulatoryReports()) === 0) {
    const reports = getRegulatoryReports();
    const rows: InsertRegulatoryReport[] = reports.map(r => ({
      ...r,
      createdAt: toIsoDate(r.createdAt) ?? new Date(),
      deadline: toIsoDate(r.deadline) ?? new Date(),
      submittedAt: toIsoDate(r.submittedAt) ?? null,
      acknowledgedAt: toIsoDate(r.acknowledgedAt) ?? null,
      submittedBy: r.submittedBy ?? null,
      reviewedBy: r.reviewedBy ?? null,
      regulatoryRef: r.regulatoryRef ?? null,
    })) as unknown as InsertRegulatoryReport[];
    await storage.bulkInsertReports(rows);
    inserted.reports = rows.length;
    didAnything = true;
  }

  // 5. Fraud register
  if ((await storage.countFraudRegister()) === 0) {
    const fraud = getFraudRegister();
    const rows: InsertFraudRegister[] = fraud.map(f => ({
      ...f,
      incidentDate: toIsoDate(f.incidentDate) ?? new Date(),
      reportedDate: toIsoDate(f.reportedDate) ?? new Date(),
      closedAt: toIsoDate(f.closedAt) ?? null,
      perpetrator: f.perpetrator ?? null,
      resolutionNotes: f.resolutionNotes ?? null,
    })) as unknown as InsertFraudRegister[];
    await storage.bulkInsertFraudRegister(rows);
    inserted.fraud = rows.length;
    didAnything = true;
  }

  // 6. EDD cases
  if ((await storage.countEddCases()) === 0) {
    const edd = getEddCases();
    const rows: InsertEddCase[] = edd.map(e => ({
      ...e,
      createdAt: toIsoDate(e.createdAt) ?? new Date(),
      dueDate: toIsoDate(e.dueDate) ?? new Date(),
    })) as unknown as InsertEddCase[];
    await storage.bulkInsertEddCases(rows);
    inserted.edd = rows.length;
    didAnything = true;
  }

  // 7. Alerts (compliance + fraud/AML)
  // We seed both alert families together when the table is empty so that case
  // generation in step 9 has fraud/AML alerts to attach to. The fraud/AML half
  // is derived from the synthetic transaction stream the UI also uses for its
  // "live feed" demo content.
  let seedFraudTxns: ReturnType<typeof generateTransactions> | null = null;
  let seedFraudAlerts: ReturnType<typeof generateAlerts> | null = null;
  if ((await storage.countAlerts()) === 0) {
    const compliance = getComplianceAlerts();
    seedFraudTxns = generateTransactions(200);
    seedFraudAlerts = generateAlerts(seedFraudTxns);
    const merged = [...compliance, ...seedFraudAlerts];
    const rows: InsertAlert[] = merged.map(a => ({
      id: a.id,
      type: a.type,
      transactionId: a.transactionId,
      customerId: a.customerId,
      riskScore: a.riskScore,
      severity: a.severity,
      status: a.status,
      assignedTo: a.assignedTo ?? null,
      createdAt: toIsoDate(a.createdAt) ?? new Date(),
      updatedAt: toIsoDate(a.updatedAt) ?? new Date(),
      resolution: a.resolution,
      contributingFactors: a.contributingFactors,
      modelVersion: a.modelVersion,
      ruleIds: a.ruleIds,
      description: a.description,
      notes: [],
    })) as unknown as InsertAlert[];
    await storage.bulkInsertAlerts(rows);
    inserted.alerts = rows.length;
    didAnything = true;
  }

  // 8. Rules
  if ((await storage.countRules()) === 0) {
    const ruleList = generateRules();
    const rows: InsertRule[] = ruleList.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      type: r.type,
      category: r.category,
      conditionGroup: r.conditionGroup as unknown,
      actions: r.actions as unknown[],
      severity: r.severity,
      condition: r.condition,
      threshold: r.threshold,
      priority: r.priority,
      isActive: r.isActive,
      triggeredCount: r.triggeredCount,
      versions: r.versions as unknown[],
      auditLog: r.auditLog as unknown[],
      currentVersion: r.currentVersion,
    })) as unknown as InsertRule[];
    await storage.bulkInsertRules(rows);
    inserted.rules = rows.length;
    didAnything = true;
  }

  // 9. Transactions (~2000) keyed to real DB customer IDs so the
  // /api/transactions endpoints, the live feed and customer drawers all see
  // recognizable IND-/BIZ- ids. Seeded BEFORE cases so case
  // customerId/transactionIds can be remapped to real persisted rows.
  const txnsByCustomer = new Map<string, string[]>();
  if ((await storage.countTransactions()) === 0) {
    const allCustomers = await storage.listCustomers();
    if (allCustomers.length > 0) {
      const synth = generateTransactions(2000);
      const rows: InsertTransaction[] = synth.map((t, i) => {
        const cust = allCustomers[i % allCustomers.length];
        const list = txnsByCustomer.get(cust.id) ?? [];
        list.push(t.id);
        txnsByCustomer.set(cust.id, list);
        return {
          id: t.id,
          customerId: cust.id,
          accountId: cust.accountNumber ?? t.accountId,
          amount: t.amount,
          currency: "NGN",
          type: t.type,
          merchantId: t.merchantId,
          merchantName: t.merchantName,
          merchantCategoryCode: t.merchantCategoryCode,
          channel: t.channel,
          deviceId: t.deviceId,
          ipAddress: t.ipAddress,
          geoLocation: t.geoLocation,
          timestamp: new Date(t.timestamp),
          cardNumberMasked: t.cardNumberMasked,
          status: t.status,
          beneficiaryId: null,
          beneficiaryAccount: null,
          description: t.description,
          riskScore: t.riskScore,
          riskLevel: t.riskLevel,
          mlProbability: t.mlProbability,
          anomalyScore: t.anomalyScore,
          rulesTriggered: t.rulesTriggered,
        } as unknown as InsertTransaction;
      });
      await storage.bulkInsertTransactions(rows);
      inserted.transactions = rows.length;
      didAnything = true;
    }
  }

  // 9b. Backfill shared signals so the Graph Network workspace surfaces
  // edges (sent_money / shared_device / common_beneficiary). The original
  // seed assigned a unique device per transaction and left
  // beneficiary_account null, which produces a fully disconnected graph.
  // This block is idempotent: it only fires if no shared device exists yet.
  {
    const pool = getPool();
    const sharedRes = await pool.query<{ n: string }>(`
      select count(*)::text as n from (
        select device_id from transactions
        where coalesce(device_id,'') <> ''
        group by device_id having count(distinct customer_id) > 1
        limit 1
      ) s
    `);
    const needDevice = Number(sharedRes.rows[0]?.n ?? 0) === 0;
    const sharedIpRes = await pool.query<{ n: string }>(`
      select count(*)::text as n from (
        select ip_address from transactions
        where coalesce(ip_address,'') <> ''
        group by ip_address having count(distinct customer_id) > 1
        limit 1
      ) s
    `);
    const needIp = Number(sharedIpRes.rows[0]?.n ?? 0) === 0;
    const sharedAddrRes = await pool.query<{ n: string }>(`
      select count(*)::text as n from (
        select address from customers
        where address is not null
        group by address having count(*) > 1
        limit 1
      ) s
    `);
    const needAddr = Number(sharedAddrRes.rows[0]?.n ?? 0) === 0;
    if (needDevice || needIp || needAddr) {
      const custRes = await pool.query<{ id: string; account_number: string | null }>(
        `select c.id, c.account_number
           from customers c
           join (
             select customer_id, count(*) as n from transactions group by customer_id
           ) t on t.customer_id = c.id
          order by t.n desc limit 30`
      );
      const customers = custRes.rows.filter((c) => c.account_number);
      if (customers.length >= 6) {
        if (needDevice) {
        // 1) sent_money: point ~25% of each top customer's transactions at
        // another top customer's account_number.
        for (let i = 0; i < customers.length; i++) {
          const src = customers[i];
          const dst = customers[(i + 1 + (i % 3)) % customers.length];
          if (!dst.account_number) continue;
          await pool.query(
            `update transactions
                set beneficiary_account = $1
              where ctid in (
                select ctid from transactions
                where customer_id = $2 and beneficiary_account is null
                order by timestamp desc limit 8
              )`,
            [dst.account_number, src.id]
          );
        }
        // 2) common_beneficiary: stamp a couple of shared external
        // beneficiary accounts across overlapping pairs of top customers.
        const externals = ["EXT-9001", "EXT-9002", "EXT-9003"];
        for (let i = 0; i < customers.length; i++) {
          const ext = externals[i % externals.length];
          await pool.query(
            `update transactions
                set beneficiary_account = $1
              where ctid in (
                select ctid from transactions
                where customer_id = $2 and beneficiary_account is null
                order by timestamp desc limit 3
              )`,
            [ext, customers[i].id]
          );
        }
        // 3) shared_device: pair adjacent top customers on a shared device id
        // for a few of their most recent transactions.
        for (let i = 0; i < customers.length - 1; i += 2) {
          const sharedDev = `DEV-shared-${i / 2 | 0}`;
          for (const c of [customers[i], customers[i + 1]]) {
            await pool.query(
              `update transactions
                  set device_id = $1
                where ctid in (
                  select ctid from transactions
                  where customer_id = $2
                  order by timestamp desc limit 4
                )`,
              [sharedDev, c.id]
            );
          }
        }
        }
        if (needIp) {
          // 4) shared_ip: pair customers offset by 3 on a common ip address.
          for (let i = 0; i + 3 < customers.length; i += 4) {
            const sharedIp = `10.42.${(i / 4 | 0) + 1}.77`;
            for (const c of [customers[i], customers[i + 3]]) {
              await pool.query(
                `update transactions
                    set ip_address = $1
                  where ctid in (
                    select ctid from transactions
                    where customer_id = $2
                    order by timestamp desc limit 3
                  )`,
                [sharedIp, c.id]
              );
            }
          }
        }
        if (needAddr) {
          // 5) shared_address: stamp the same JSON address on pairs of
          // customer rows. Mirrors "two accounts at the same street address".
          for (let i = 0; i + 5 < customers.length; i += 6) {
            const ringIdx = (i / 6 | 0) + 1;
            const addr = JSON.stringify({
              street: `${10 + ringIdx} Allen Avenue`,
              city: "Lagos",
              state: "Lagos",
              country: "Nigeria",
            });
            for (const c of [customers[i], customers[i + 5]]) {
              await pool.query(`update customers set address = $1::jsonb where id = $2`, [addr, c.id]);
            }
          }
        }
        console.log("[seed] Graph network backfill applied: shared devices/ips/addresses + beneficiaries");
        didAnything = true;
      }
    }
  }

  // 10. Cases (derived from alerts; remapped onto real customers + their txns)
  if ((await storage.countCases()) === 0) {
    const txns = seedFraudTxns ?? generateTransactions(200);
    const alertsForCases = seedFraudAlerts ?? generateAlerts(txns);
    const caseList = generateCases(alertsForCases);

    // If transactions were already seeded in a previous run, txnsByCustomer
    // is empty — rebuild it from the DB so case remapping still works.
    let custTxnMap = txnsByCustomer;
    if (custTxnMap.size === 0) {
      const existing = await storage.listTransactions({ limit: 5000 });
      custTxnMap = new Map();
      for (const t of existing) {
        const list = custTxnMap.get(t.customerId) ?? [];
        list.push(t.id);
        custTxnMap.set(t.customerId, list);
      }
    }
    const realCustomerIds = Array.from(custTxnMap.keys());

    const rows: InsertCase[] = caseList
      .filter(() => realCustomerIds.length > 0)
      .map((c, i) => {
        const realCust = realCustomerIds[i % realCustomerIds.length];
        const custTxns = custTxnMap.get(realCust) ?? [];
        const realTxnIds = custTxns.slice(0, Math.min(5, Math.max(1, c.transactionIds.length)));
        return {
          id: c.id,
          type: c.type,
          alertIds: c.alertIds,
          transactionIds: realTxnIds,
          customerId: realCust,
          assignedTo: c.assignedTo ?? null,
          priority: c.priority,
          status: c.status,
          createdAt: toIsoDate(c.createdAt) ?? new Date(),
          updatedAt: toIsoDate(c.updatedAt) ?? new Date(),
          dueDate: toIsoDate(c.dueDate) ?? null,
          resolution: c.resolution ?? null,
          tags: c.tags,
          notes: c.notes as unknown[],
          timeline: c.timeline as unknown[],
          linkedEntities: c.linkedEntities as unknown[],
          evidence: c.evidence as unknown[],
          description: c.description ?? null,
        };
      }) as unknown as InsertCase[];
    if (rows.length > 0) {
      await storage.bulkInsertCases(rows);
      inserted.cases = rows.length;
      didAnything = true;
    }
  }

  // 10. Roles (must precede users for assignments)
  if ((await storage.countRoles()) === 0) {
    const defs = generateRoleDefinitions();
    const roleRows: InsertRole[] = defs.map(r => ({
      id: r.id,
      name: r.name,
      label: r.label,
      description: r.description,
      privilegeLevel: r.privilegeLevel,
      permissionKeys: r.permissions,
    }));
    await storage.bulkInsertRoles(roleRows);
    inserted.roles = roleRows.length;
    didAnything = true;
  }

  // 11. Users
  if ((await storage.countUsers()) === 0) {
    const iamUsers = generateIAMUsers();
    const userRows: InsertUser[] = iamUsers.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.roles[0] ?? "viewer",
      isActive: u.status === "active",
      roles: u.roles,
      privilegeLevel: u.privilegeLevel,
      status: u.status,
      department: u.department,
      team: u.team,
      title: u.title,
      mfaEnabled: u.mfaEnabled,
      ssoProvider: u.ssoProvider,
      authMethod: u.authMethod,
      lastLogin: toIsoDate(u.lastLogin) ?? null,
      lastLoginIp: u.lastLoginIp || null,
      lastLoginLocation: u.lastLoginLocation || null,
      lastLoginDevice: u.lastLoginDevice || null,
      lastActivity: toIsoDate(u.lastActivity) ?? null,
      lastActivityAction: u.lastActivityAction || null,
      failedLogins24h: u.failedLogins24h,
      createdBy: u.createdBy,
      sessions: u.sessions as unknown[],
      auditLog: u.auditLog as unknown[],
      approvals: u.approvals as unknown[],
    })) as unknown as InsertUser[];
    await storage.bulkInsertUsers(userRows);
    inserted.users = userRows.length;
    didAnything = true;

    // 12. Role assignments derived from each user's roles[]
    const allRoles = await storage.listRoles();
    const roleByName = new Map(allRoles.map(r => [r.name, r.id]));
    const assignmentRows: InsertUserRoleAssignment[] = [];
    for (const u of iamUsers) {
      for (const rname of u.roles) {
        const rid = roleByName.get(rname);
        if (rid) assignmentRows.push({ userId: u.id, roleId: rid, assignedBy: u.createdBy ?? null });
      }
    }
    if (assignmentRows.length > 0) {
      await storage.bulkInsertAssignments(assignmentRows);
      inserted.assignments = assignmentRows.length;
    }

    // 13. Seed audit log entries from each user's embedded auditLog
    for (const u of iamUsers) {
      for (const e of u.auditLog.slice(0, 3)) {
        await storage.appendAudit({
          actorUserId: u.id,
          actorName: u.name,
          action: e.action,
          targetType: "user",
          targetId: u.id,
          ipAddress: e.ipAddress ?? null,
          metadata: { details: e.details },
        });
      }
    }
  }

  // 14. Models + evaluations + audit history (Task #40)
  if ((await storage.countModels()) === 0) {
    const seeds = generateModelSeeds();
    await storage.bulkInsertModels(seeds.map(s => s.model));
    const evals: InsertModelEvaluation[] = seeds.map((s, i) => ({
      id: `MEVAL-${String(i + 1).padStart(3, "0")}`,
      modelId: s.model.id!,
      ...s.evaluation,
    }));
    await storage.bulkInsertEvaluations(evals);
    inserted.models = seeds.length;
    inserted.modelEvaluations = evals.length;
    didAnything = true;

    for (const s of seeds) {
      for (const e of s.auditLog) {
        await storage.appendAudit({
          actorUserId: null,
          actorName: e.actor,
          action: e.action,
          targetType: "model",
          targetId: s.model.id!,
          ipAddress: null,
          metadata: { details: e.details, seededAt: e.timestamp },
        });
      }
    }
  }

  // Reconcile roles + canonical demo accounts on EVERY boot (Task #46).
  // This converges the role permission map and ensures one named account
  // per business role exists for the header user-switcher, even on
  // databases that were seeded before this feature shipped.
  const reconciled = await reconcileRolesAndDemoAccounts();
  if (reconciled.changed > 0) {
    didAnything = true;
    console.log("[seed] Reconciled roles+demo accounts:", reconciled);
  }

  if (!didAnything) {
    console.log("[seed] All tables already populated — skipping seed.");
    return { skipped: true, inserted };
  }
  console.log("[seed] Inserted:", inserted);
  return { skipped: false, inserted };
}

/**
 * Idempotent reconciler — runs on every boot.
 *  - Upserts the canonical role rows (admin, risk_analyst, compliance_officer,
 *    aml_analyst, ml_engineer, auditor, viewer) so their `permissionKeys`
 *    always match the source of truth in `generateRoleDefinitions()`.
 *  - Upserts one canonical demo account per role (USR-DEMO-*) and ensures
 *    the matching `user_role_assignments` row exists. Missing rows are
 *    created; existing rows have their key columns reset.
 */
export async function reconcileRolesAndDemoAccounts(): Promise<{ changed: number; rolesUpserted: number; usersUpserted: number; assignmentsUpserted: number }> {
  const pool = getPool();
  const stats = { changed: 0, rolesUpserted: 0, usersUpserted: 0, assignmentsUpserted: 0 };

  // 1. Roles: upsert each canonical role definition by `name`.
  // IMPORTANT: This loop ONLY iterates the canonical role definitions
  // returned by `generateRoleDefinitions()`. Admin-created custom roles
  // (any row in `roles` whose `name` is not in CANONICAL_ROLE_NAMES) are
  // intentionally NOT touched here, so their label / description /
  // permissionKeys persist across restarts. See Task #47 (edit-role UI).
  const defs = generateRoleDefinitions();
  for (const r of defs) {
    const result = await pool.query(
      `INSERT INTO "roles" ("id","name","label","description","privilege_level","permission_keys","created_at","updated_at")
       VALUES ($1,$2,$3,$4,$5,$6,now(),now())
       ON CONFLICT ("name") DO UPDATE SET
         "label" = EXCLUDED."label",
         "description" = EXCLUDED."description",
         "privilege_level" = EXCLUDED."privilege_level",
         "permission_keys" = EXCLUDED."permission_keys",
         "updated_at" = now()
       RETURNING xmax = 0 AS inserted`,
      [r.id, r.name, r.label, r.description, r.privilegeLevel, r.permissions],
    );
    if (result.rowCount && result.rowCount > 0) { stats.rolesUpserted++; stats.changed++; }
  }

  // 2. Look up role IDs by name (post-upsert).
  const roleIdRes = await pool.query(`SELECT "id","name" FROM "roles"`);
  const roleIdByName = new Map<string, string>(roleIdRes.rows.map((row) => [row.name, row.id]));

  // 3. Demo accounts: upsert one named user per role + matching assignment.
  // Seed each demo user with a default password hash so the local-auth login
  // flow works out of the box. Operators can override via DEMO_USER_PASSWORD.
  const { hashPassword } = await import("./auth.js");
  const demoPassword = process.env.DEMO_USER_PASSWORD || "Demo123!";
  for (const acct of CANONICAL_DEMO_ACCOUNTS) {
    const passwordHash = hashPassword(demoPassword);
    const userResult = await pool.query(
      `INSERT INTO "users" (
         "id","email","name","role","is_active","roles","privilege_level","status",
         "department","team","title","mfa_enabled","sso_provider","auth_method",
         "failed_logins_24h","created_by","created_at","sessions","audit_log","approvals",
         "password_hash","password_updated_at"
       ) VALUES (
         $1,$2,$3,$4,true,$5,$6,'active',$7,'',$8,true,'none','local',0,'System',now(),'[]'::jsonb,'[]'::jsonb,'[]'::jsonb,
         $9,now()
       )
       ON CONFLICT ("id") DO UPDATE SET
         "email" = EXCLUDED."email",
         "name" = EXCLUDED."name",
         "role" = EXCLUDED."role",
         "roles" = EXCLUDED."roles",
         "privilege_level" = EXCLUDED."privilege_level",
         "is_active" = true,
         "status" = 'active',
         "department" = EXCLUDED."department",
         "title" = EXCLUDED."title",
         "password_hash" = COALESCE("users"."password_hash", EXCLUDED."password_hash"),
         "password_updated_at" = COALESCE("users"."password_updated_at", EXCLUDED."password_updated_at")
       RETURNING xmax = 0 AS inserted`,
      [
        acct.id,
        acct.email,
        acct.name,
        acct.role,
        [acct.role],
        acct.role === 'admin' ? 'admin' : (acct.role === 'risk_analyst' || acct.role === 'compliance_officer' || acct.role === 'ml_engineer') ? 'elevated' : 'standard',
        acct.department,
        acct.title,
        passwordHash,
      ],
    );
    if (userResult.rowCount && userResult.rowCount > 0) { stats.usersUpserted++; stats.changed++; }

    const roleId = roleIdByName.get(acct.role);
    if (!roleId) continue;
    // Idempotent assignment: stable id derived from user+role.
    const assignmentId = `URA-DEMO-${acct.id}-${roleId}`;
    const asgnRes = await pool.query(
      `INSERT INTO "user_role_assignments" ("id","user_id","role_id","assigned_at","assigned_by")
       VALUES ($1,$2,$3,now(),'System')
       ON CONFLICT ("id") DO NOTHING
       RETURNING xmax = 0 AS inserted`,
      [assignmentId, acct.id, roleId],
    );
    if (asgnRes.rowCount && asgnRes.rowCount > 0) { stats.assignmentsUpserted++; stats.changed++; }
  }

  return stats;
}
