import { eq, sql, desc, and, gte, lt } from "drizzle-orm";
import { getDb } from "./db.js";
import {
  customers, customerDocuments, screeningMatches, regulatoryReports,
  fraudRegister, eddCases, alerts, cases, transactions, users, customerActions,
  rules, ruleSimulations,
  roles, userRoleAssignments, auditLog,
  chatSessions, reportArtifacts,
  models, modelEvaluations,
  type CustomerRow, type CustomerDocumentRow, type ScreeningMatchRow,
  type RegulatoryReportRow, type FraudRegisterRow, type EddCaseRow,
  type AlertRow, type CaseRow, type TransactionRow, type UserRow,
  type CustomerActionRow, type RuleRow, type RuleSimulationRow,
  type RoleRow, type UserRoleAssignmentRow, type AuditLogRow,
  type ChatSessionRow, type ReportArtifactRow,
  type InsertCustomer, type InsertCustomerDocument, type InsertCustomerAction,
  type InsertScreeningMatch, type InsertRegulatoryReport, type InsertFraudRegister,
  type InsertEddCase, type InsertAlert, type InsertCase, type InsertTransaction,
  type InsertRule, type InsertRuleSimulation,
  type InsertChatSession, type InsertReportArtifact,
  type InsertModel, type ModelRow, type InsertModelEvaluation, type ModelEvaluationRow,
  type DashboardKpisPayload, type DashboardTrendsPayload, type ComplianceSnapshotPayload,
  type RiskPyramidTier, type ChannelBreakdownEntry, type TxnVolumeBucket, type FraudTrendPoint,
  type GraphNetworkPayload, type GraphNetworkNode, type GraphNetworkEdge, type GraphRiskBand,
  type InsertUser, type InsertRole, type InsertUserRoleAssignment, type InsertAuditLog,
  type AnalyticsTab, type AnalyticsFiltersInput, type AnalyticsTabPayloadMap,
} from "../shared/schema.js";
import { getAnalyticsTab } from "./analytics.js";

export interface TransactionFilters {
  customerId?: string;
  search?: string;
  type?: string;
  status?: string;
  riskLevel?: string;
  riskMin?: number;
  riskMax?: number;
  since?: Date;
  limit?: number;
}

export interface IStorage {
  // Customers
  listCustomers(): Promise<CustomerRow[]>;
  getCustomer(id: string): Promise<CustomerRow | undefined>;
  createCustomer(c: InsertCustomer, docs?: InsertCustomerDocument[]): Promise<CustomerRow>;
  upsertCustomers(rows: InsertCustomer[]): Promise<void>;
  countCustomers(): Promise<number>;

  // Documents
  listCustomerDocuments(customerId: string): Promise<CustomerDocumentRow[]>;
  listAllCustomerDocuments(): Promise<CustomerDocumentRow[]>;
  bulkInsertDocuments(rows: InsertCustomerDocument[]): Promise<void>;

  // Other modules (read-mostly for now; bulk-seeded)
  listScreening(): Promise<ScreeningMatchRow[]>;
  countScreening(): Promise<number>;
  bulkInsertScreening(rows: InsertScreeningMatch[]): Promise<void>;

  listRegulatoryReports(): Promise<RegulatoryReportRow[]>;
  getRegulatoryReport(id: string): Promise<RegulatoryReportRow | undefined>;
  createRegulatoryReport(row: InsertRegulatoryReport): Promise<RegulatoryReportRow>;
  updateRegulatoryReport(id: string, patch: Partial<InsertRegulatoryReport>): Promise<RegulatoryReportRow | undefined>;
  countRegulatoryReports(): Promise<number>;
  bulkInsertReports(rows: InsertRegulatoryReport[]): Promise<void>;

  listFraudRegister(): Promise<FraudRegisterRow[]>;
  getFraudRegisterEntry(id: string): Promise<FraudRegisterRow | undefined>;
  createFraudRegisterEntry(row: InsertFraudRegister): Promise<FraudRegisterRow>;
  updateFraudRegisterEntry(id: string, patch: Partial<InsertFraudRegister>): Promise<FraudRegisterRow | undefined>;
  appendFraudTimeline(id: string, entry: Record<string, unknown>): Promise<FraudRegisterRow | undefined>;
  countFraudRegister(): Promise<number>;
  bulkInsertFraudRegister(rows: InsertFraudRegister[]): Promise<void>;

  listEddCases(): Promise<EddCaseRow[]>;
  countEddCases(): Promise<number>;
  bulkInsertEddCases(rows: InsertEddCase[]): Promise<void>;

  listAlerts(): Promise<AlertRow[]>;
  getAlert(id: string): Promise<AlertRow | undefined>;
  createAlert(row: InsertAlert): Promise<AlertRow>;
  updateAlert(id: string, patch: Partial<InsertAlert>): Promise<AlertRow | undefined>;
  countAlerts(): Promise<number>;
  bulkInsertAlerts(rows: InsertAlert[]): Promise<void>;

  listCases(): Promise<CaseRow[]>;
  getCase(id: string): Promise<CaseRow | undefined>;
  createCase(row: InsertCase): Promise<CaseRow>;
  updateCase(id: string, patch: Partial<InsertCase>): Promise<CaseRow | undefined>;
  appendCaseArray(
    id: string,
    field: "notes" | "timeline" | "linkedEntities" | "evidence",
    entry: Record<string, unknown>,
  ): Promise<CaseRow | undefined>;
  countCases(): Promise<number>;
  bulkInsertCases(rows: InsertCase[]): Promise<void>;

  listTransactions(filters?: TransactionFilters): Promise<TransactionRow[]>;
  getTransaction(id: string): Promise<TransactionRow | undefined>;
  createTransaction(row: InsertTransaction): Promise<TransactionRow>;
  countTransactions(): Promise<number>;
  sampleTransactions(opts?: { size?: number; sinceDays?: number }): Promise<TransactionRow[]>;
  getTransactionsHourly(hours: number): Promise<Array<{ timestamp: string; value: number; highRiskPct: number; label: string }>>;
  getCustomerAggregates(): Promise<Array<{
    customerId: string;
    openCases: number;
    openAlerts: number;
    txnCount: number;
    avgTicket: number;
    lastActivityMs: number | null;
    crossBorder: boolean;
  }>>;
  bulkInsertTransactions(rows: InsertTransaction[]): Promise<void>;

  countCustomerDocuments(): Promise<number>;

  // Users / IAM
  listUsers(): Promise<UserRow[]>;
  getUser(id: string): Promise<UserRow | undefined>;
  countUsers(): Promise<number>;
  createUser(u: InsertUser): Promise<UserRow>;
  updateUser(id: string, patch: Partial<InsertUser>): Promise<UserRow | undefined>;
  bulkInsertUsers(rows: InsertUser[]): Promise<void>;

  // Roles
  listRoles(): Promise<RoleRow[]>;
  countRoles(): Promise<number>;
  createRole(r: InsertRole): Promise<RoleRow>;
  updateRole(id: string, patch: Partial<InsertRole>): Promise<RoleRow | undefined>;
  deleteRole(id: string): Promise<void>;
  bulkInsertRoles(rows: InsertRole[]): Promise<void>;

  // Role assignments
  listAssignments(): Promise<UserRoleAssignmentRow[]>;
  countAssignments(): Promise<number>;
  assignRole(row: InsertUserRoleAssignment): Promise<UserRoleAssignmentRow>;
  unassignRole(userId: string, roleId: string): Promise<void>;
  bulkInsertAssignments(rows: InsertUserRoleAssignment[]): Promise<void>;

  // Audit log
  listAuditLog(opts?: {
    actorUserId?: string;
    targetType?: string;
    targetId?: string;
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ rows: AuditLogRow[]; total: number }>;
  appendAudit(row: InsertAuditLog): Promise<AuditLogRow>;

  // Customer actions / activity
  listCustomerActions(customerId: string, limit?: number): Promise<CustomerActionRow[]>;
  appendCustomerAction(row: InsertCustomerAction): Promise<CustomerActionRow>;

  // Rules
  listRules(): Promise<RuleRow[]>;
  getRule(id: string): Promise<RuleRow | undefined>;
  createRule(row: InsertRule): Promise<RuleRow>;
  updateRule(id: string, patch: Partial<InsertRule>): Promise<RuleRow | undefined>;
  deleteRule(id: string): Promise<boolean>;
  countRules(): Promise<number>;
  bulkInsertRules(rows: InsertRule[]): Promise<void>;

  // Rule simulations
  appendRuleSimulation(row: InsertRuleSimulation): Promise<RuleSimulationRow>;
  listRuleSimulations(ruleId: string, limit?: number): Promise<RuleSimulationRow[]>;

  // Dashboard aggregates (server-side rollups over live tables)
  getDashboardKpis(): Promise<DashboardKpisPayload>;
  getDashboardTrends(window: "24h" | "7d" | "30d"): Promise<DashboardTrendsPayload>;
  getComplianceSnapshot(): Promise<ComplianceSnapshotPayload>;

  // Analytics aggregates (per-tab; window/channel/country params)
  getAnalytics<T extends AnalyticsTab>(tab: T, filters: AnalyticsFiltersInput): Promise<AnalyticsTabPayloadMap[T]>;

  // Graph Network derivation (customers + transactions + shared device/beneficiary)
  getGraphNetwork(opts: {
    window?: "24h" | "7d" | "30d" | "all";
    riskLevel?: string;
    entityType?: string;
    edgeType?: string;
    limit?: number;
  }): Promise<GraphNetworkPayload>;

  // AI chat sessions (metadata in DB; messages JSON in OBS)
  listChatSessions(opts?: { ownerUserId?: string; limit?: number }): Promise<ChatSessionRow[]>;
  getChatSession(id: string): Promise<ChatSessionRow | undefined>;
  createChatSession(row: InsertChatSession): Promise<ChatSessionRow>;
  updateChatSession(id: string, patch: Partial<InsertChatSession>): Promise<ChatSessionRow | undefined>;
  deleteChatSession(id: string): Promise<boolean>;

  // Report artifacts (PDF/XML rendered server-side, stored in OBS)
  listReportArtifacts(reportId: string): Promise<ReportArtifactRow[]>;
  getReportArtifact(id: string): Promise<ReportArtifactRow | undefined>;
  createReportArtifact(row: InsertReportArtifact): Promise<ReportArtifactRow>;
  nextArtifactVersion(reportId: string, kind: string): Promise<number>;

  // Models
  listModels(): Promise<ModelRow[]>;
  getModel(id: string): Promise<ModelRow | undefined>;
  countModels(): Promise<number>;
  createModel(row: InsertModel): Promise<ModelRow>;
  updateModel(id: string, patch: Partial<InsertModel>): Promise<ModelRow | undefined>;
  bulkInsertModels(rows: InsertModel[]): Promise<void>;
  nextModelId(): Promise<string>;

  // Model evaluations
  getLatestEvaluation(modelId: string): Promise<ModelEvaluationRow | undefined>;
  upsertEvaluation(row: InsertModelEvaluation): Promise<ModelEvaluationRow>;
  bulkInsertEvaluations(rows: InsertModelEvaluation[]): Promise<void>;
}

class DrizzleStorage implements IStorage {
  private db = getDb();

  async listCustomers(): Promise<CustomerRow[]> {
    return this.db.select().from(customers).orderBy(desc(customers.onboardedAt));
  }
  async getCustomer(id: string): Promise<CustomerRow | undefined> {
    const r = await this.db.select().from(customers).where(eq(customers.id, id)).limit(1);
    return r[0];
  }
  async createCustomer(c: InsertCustomer, docs: InsertCustomerDocument[] = []): Promise<CustomerRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(customers).values(c).returning();
      if (docs.length > 0) {
        await tx.insert(customerDocuments).values(docs.map(d => ({ ...d, customerId: row.id })));
      }
      return row;
    });
  }
  async upsertCustomers(rows: InsertCustomer[]): Promise<void> {
    if (rows.length === 0) return;
    // Chunk for safety
    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      await this.db.insert(customers).values(chunk).onConflictDoNothing();
    }
  }
  async countCustomers(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(customers);
    return r[0]?.n ?? 0;
  }

  async listCustomerDocuments(customerId: string): Promise<CustomerDocumentRow[]> {
    return this.db.select().from(customerDocuments).where(eq(customerDocuments.customerId, customerId));
  }
  async listAllCustomerDocuments(): Promise<CustomerDocumentRow[]> {
    return this.db.select().from(customerDocuments);
  }
  async bulkInsertDocuments(rows: InsertCustomerDocument[]): Promise<void> {
    if (rows.length === 0) return;
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await this.db.insert(customerDocuments).values(rows.slice(i, i + chunkSize)).onConflictDoNothing();
    }
  }
  async countCustomerDocuments(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(customerDocuments);
    return r[0]?.n ?? 0;
  }

  async listScreening(): Promise<ScreeningMatchRow[]> {
    return this.db.select().from(screeningMatches).orderBy(desc(screeningMatches.detectedAt));
  }
  async countScreening(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(screeningMatches);
    return r[0]?.n ?? 0;
  }
  async bulkInsertScreening(rows: InsertScreeningMatch[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(screeningMatches).values(rows).onConflictDoNothing();
  }

  async listRegulatoryReports(): Promise<RegulatoryReportRow[]> {
    return this.db.select().from(regulatoryReports).orderBy(desc(regulatoryReports.createdAt));
  }
  async countRegulatoryReports(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(regulatoryReports);
    return r[0]?.n ?? 0;
  }
  async bulkInsertReports(rows: InsertRegulatoryReport[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(regulatoryReports).values(rows).onConflictDoNothing();
  }
  async getRegulatoryReport(id: string): Promise<RegulatoryReportRow | undefined> {
    const r = await this.db.select().from(regulatoryReports).where(eq(regulatoryReports.id, id)).limit(1);
    return r[0];
  }
  async createRegulatoryReport(row: InsertRegulatoryReport): Promise<RegulatoryReportRow> {
    const [r] = await this.db.insert(regulatoryReports).values(row).returning();
    return r;
  }
  async updateRegulatoryReport(id: string, patch: Partial<InsertRegulatoryReport>): Promise<RegulatoryReportRow | undefined> {
    const [r] = await this.db.update(regulatoryReports).set(patch).where(eq(regulatoryReports.id, id)).returning();
    return r;
  }

  async listFraudRegister(): Promise<FraudRegisterRow[]> {
    return this.db.select().from(fraudRegister).orderBy(desc(fraudRegister.incidentDate));
  }
  async countFraudRegister(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(fraudRegister);
    return r[0]?.n ?? 0;
  }
  async bulkInsertFraudRegister(rows: InsertFraudRegister[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(fraudRegister).values(rows).onConflictDoNothing();
  }
  async getFraudRegisterEntry(id: string): Promise<FraudRegisterRow | undefined> {
    const r = await this.db.select().from(fraudRegister).where(eq(fraudRegister.id, id)).limit(1);
    return r[0];
  }
  async createFraudRegisterEntry(row: InsertFraudRegister): Promise<FraudRegisterRow> {
    const [r] = await this.db.insert(fraudRegister).values(row).returning();
    return r;
  }
  async appendFraudTimeline(id: string, entry: Record<string, unknown>): Promise<FraudRegisterRow | undefined> {
    const payload = JSON.stringify([entry]);
    const [r] = await this.db
      .update(fraudRegister)
      .set({ timeline: sql`coalesce(${sql.identifier("timeline")}, '[]'::jsonb) || ${payload}::jsonb` } as never)
      .where(eq(fraudRegister.id, id))
      .returning();
    return r;
  }
  async updateFraudRegisterEntry(id: string, patch: Partial<InsertFraudRegister>): Promise<FraudRegisterRow | undefined> {
    const [r] = await this.db.update(fraudRegister).set(patch).where(eq(fraudRegister.id, id)).returning();
    return r;
  }

  async listEddCases(): Promise<EddCaseRow[]> {
    return this.db.select().from(eddCases).orderBy(desc(eddCases.createdAt));
  }
  async countEddCases(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(eddCases);
    return r[0]?.n ?? 0;
  }
  async bulkInsertEddCases(rows: InsertEddCase[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(eddCases).values(rows).onConflictDoNothing();
  }

  async listAlerts(): Promise<AlertRow[]> {
    return this.db.select().from(alerts).orderBy(desc(alerts.createdAt));
  }
  async getAlert(id: string): Promise<AlertRow | undefined> {
    const r = await this.db.select().from(alerts).where(eq(alerts.id, id)).limit(1);
    return r[0];
  }
  async createAlert(row: InsertAlert): Promise<AlertRow> {
    const [r] = await this.db.insert(alerts).values(row).returning();
    return r;
  }
  async updateAlert(id: string, patch: Partial<InsertAlert>): Promise<AlertRow | undefined> {
    const [r] = await this.db
      .update(alerts)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(alerts.id, id))
      .returning();
    return r;
  }
  async countAlerts(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(alerts);
    return r[0]?.n ?? 0;
  }
  async bulkInsertAlerts(rows: InsertAlert[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(alerts).values(rows).onConflictDoNothing();
  }

  async listCases(): Promise<CaseRow[]> {
    return this.db.select().from(cases).orderBy(desc(cases.createdAt));
  }
  async getCase(id: string): Promise<CaseRow | undefined> {
    const r = await this.db.select().from(cases).where(eq(cases.id, id)).limit(1);
    return r[0];
  }
  async createCase(row: InsertCase): Promise<CaseRow> {
    const [r] = await this.db.insert(cases).values(row).returning();
    return r;
  }
  async updateCase(id: string, patch: Partial<InsertCase>): Promise<CaseRow | undefined> {
    const [r] = await this.db
      .update(cases)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(cases.id, id))
      .returning();
    return r;
  }
  /**
   * Atomically append `entry` to the JSONB array column `field` on a case row.
   * Uses Postgres `||` so concurrent appends from different requests can't
   * clobber each other (read-modify-write would lose updates).
   */
  async appendCaseArray(
    id: string,
    field: "notes" | "timeline" | "linkedEntities" | "evidence",
    entry: Record<string, unknown>,
  ): Promise<CaseRow | undefined> {
    const column = sql.identifier(
      field === "linkedEntities" ? "linked_entities" : field,
    );
    const payload = JSON.stringify([entry]);
    const [r] = await this.db
      .update(cases)
      .set({
        [field]: sql`coalesce(${column}, '[]'::jsonb) || ${payload}::jsonb`,
        updatedAt: new Date(),
      } as never)
      .where(eq(cases.id, id))
      .returning();
    return r;
  }
  async countCases(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(cases);
    return r[0]?.n ?? 0;
  }
  async bulkInsertCases(rows: InsertCase[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(cases).values(rows).onConflictDoNothing();
  }

  async listTransactions(filters: TransactionFilters = {}): Promise<TransactionRow[]> {
    const conds = [] as ReturnType<typeof eq>[];
    if (filters.customerId) conds.push(eq(transactions.customerId, filters.customerId));
    if (filters.type) conds.push(eq(transactions.type, filters.type));
    if (filters.status) conds.push(eq(transactions.status, filters.status));
    if (filters.riskLevel) conds.push(eq(transactions.riskLevel, filters.riskLevel));
    if (typeof filters.riskMin === "number") conds.push(sql`${transactions.riskScore} >= ${filters.riskMin}` as never);
    if (typeof filters.riskMax === "number") conds.push(sql`${transactions.riskScore} <= ${filters.riskMax}` as never);
    if (filters.since) conds.push(sql`${transactions.timestamp} > ${filters.since}` as never);
    if (filters.search) {
      const q = `%${filters.search.toLowerCase()}%`;
      conds.push(sql`(lower(${transactions.id}) like ${q} or lower(${transactions.customerId}) like ${q} or lower(${transactions.merchantName}) like ${q})` as never);
    }
    const limit = Math.min(Math.max(filters.limit ?? 500, 1), 5000);
    let query = this.db.select().from(transactions).$dynamic();
    if (conds.length > 0) query = query.where(sql.join(conds, sql` and `));
    return query.orderBy(desc(transactions.timestamp)).limit(limit);
  }
  async getTransaction(id: string): Promise<TransactionRow | undefined> {
    const r = await this.db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    return r[0];
  }
  async createTransaction(row: InsertTransaction): Promise<TransactionRow> {
    const [r] = await this.db.insert(transactions).values(row).returning();
    return r;
  }
  async countTransactions(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(transactions);
    return r[0]?.n ?? 0;
  }

  async sampleTransactions(opts: { size?: number; sinceDays?: number } = {}): Promise<TransactionRow[]> {
    const size = Math.min(Math.max(opts.size ?? 500, 1), 5000);
    const since = typeof opts.sinceDays === "number" && Number.isFinite(opts.sinceDays)
      ? Math.max(1, Math.min(365, Math.trunc(opts.sinceDays)))
      : null;
    let q = this.db.select().from(transactions).$dynamic();
    if (since !== null) {
      q = q.where(sql`${transactions.timestamp} >= now() - (${since} || ' day')::interval`);
    }
    return q.orderBy(sql`random()`).limit(size);
  }

  async getTransactionsHourly(hours: number): Promise<Array<{ timestamp: string; value: number; highRiskPct: number; label: string }>> {
    const h = Math.min(Math.max(Math.trunc(hours) || 24, 1), 168);
    const span = sql.raw(`interval '${h - 1} hour'`);
    const result = await this.db.execute(sql`
      with axis as (
        select generate_series(
          date_trunc('hour', now()) - ${span},
          date_trunc('hour', now()),
          interval '1 hour'
        ) as bucket
      ),
      agg as (
        select date_trunc('hour', timestamp) as bucket,
          count(*)::int as n,
          sum(case when risk_level in ('high','critical') then 1 else 0 end)::int as hr
        from transactions
        where timestamp >= date_trunc('hour', now()) - ${span}
        group by 1
      )
      select axis.bucket,
        coalesce(agg.n, 0)::int as value,
        case when coalesce(agg.n, 0) > 0
          then round(coalesce(agg.hr, 0)::numeric / agg.n * 100)::int
          else 0 end as high_risk_pct
      from axis left join agg on agg.bucket = axis.bucket
      order by axis.bucket
    `);
    return (result.rows as Array<{ bucket: Date | string; value: number; high_risk_pct: number }>).map(r => {
      const d = r.bucket instanceof Date ? r.bucket : new Date(r.bucket);
      return {
        timestamp: d.toISOString(),
        value: Number(r.value),
        highRiskPct: Number(r.high_risk_pct),
        label: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
      };
    });
  }

  async getCustomerAggregates(): Promise<Array<{
    customerId: string;
    openCases: number;
    openAlerts: number;
    txnCount: number;
    avgTicket: number;
    lastActivityMs: number | null;
    crossBorder: boolean;
  }>> {
    const result = await this.db.execute(sql`
      with case_counts as (
        select customer_id, count(*)::int as n
        from cases where status not in ('closed','resolved')
        group by customer_id
      ),
      alert_counts as (
        select customer_id, count(*)::int as n
        from alerts where status not in ('closed','resolved')
        group by customer_id
      ),
      txn_agg as (
        select t.customer_id,
          count(*)::int as cnt,
          coalesce(avg(t.amount),0)::float as avg_amt,
          (extract(epoch from max(t.timestamp)) * 1000)::float8 as last_ms,
          sum(case
            when t.geo_location->>'country' is not null
              and t.geo_location->>'country' <> coalesce(c.address->>'country','Nigeria')
            then 1 else 0 end)::int as xb
        from transactions t
        join customers c on c.id = t.customer_id
        group by t.customer_id
      )
      select c.id as customer_id,
        coalesce(cc.n, 0)::int as open_cases,
        coalesce(ac.n, 0)::int as open_alerts,
        coalesce(tx.cnt, 0)::int as txn_count,
        coalesce(tx.avg_amt, 0)::float as avg_ticket,
        tx.last_ms as last_activity_ms,
        coalesce(tx.xb, 0)::int as cross_border_count
      from customers c
      left join case_counts cc on cc.customer_id = c.id
      left join alert_counts ac on ac.customer_id = c.id
      left join txn_agg tx on tx.customer_id = c.id
    `);
    return (result.rows as Array<{
      customer_id: string; open_cases: number; open_alerts: number;
      txn_count: number; avg_ticket: number; last_activity_ms: number | null; cross_border_count: number;
    }>).map(r => ({
      customerId: r.customer_id,
      openCases: Number(r.open_cases),
      openAlerts: Number(r.open_alerts),
      txnCount: Number(r.txn_count),
      avgTicket: Number(r.avg_ticket),
      lastActivityMs: r.last_activity_ms != null ? Number(r.last_activity_ms) : null,
      crossBorder: Number(r.cross_border_count) > 0,
    }));
  }

  async bulkInsertTransactions(rows: InsertTransaction[]): Promise<void> {
    if (rows.length === 0) return;
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      await this.db.insert(transactions).values(rows.slice(i, i + chunkSize)).onConflictDoNothing();
    }
  }

  async listUsers(): Promise<UserRow[]> {
    return this.db.select().from(users).orderBy(users.email);
  }
  async getUser(id: string): Promise<UserRow | undefined> {
    const r = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return r[0];
  }
  async countUsers(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(users);
    return r[0]?.n ?? 0;
  }
  async createUser(u: InsertUser): Promise<UserRow> {
    const [row] = await this.db.insert(users).values(u).returning();
    return row;
  }
  async updateUser(id: string, patch: Partial<InsertUser>): Promise<UserRow | undefined> {
    if (Object.keys(patch).length === 0) return this.getUser(id);
    const [row] = await this.db.update(users).set(patch).where(eq(users.id, id)).returning();
    return row;
  }
  async bulkInsertUsers(rows: InsertUser[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(users).values(rows).onConflictDoNothing();
  }

  async listRoles(): Promise<RoleRow[]> {
    return this.db.select().from(roles).orderBy(roles.name);
  }
  async countRoles(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(roles);
    return r[0]?.n ?? 0;
  }
  async createRole(r: InsertRole): Promise<RoleRow> {
    const [row] = await this.db.insert(roles).values(r).returning();
    return row;
  }
  async updateRole(id: string, patch: Partial<InsertRole>): Promise<RoleRow | undefined> {
    if (Object.keys(patch).length === 0) {
      const cur = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
      return cur[0];
    }
    const [row] = await this.db
      .update(roles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(roles.id, id))
      .returning();
    return row;
  }
  async deleteRole(id: string): Promise<void> {
    await this.db.delete(roles).where(eq(roles.id, id));
  }
  async bulkInsertRoles(rows: InsertRole[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(roles).values(rows).onConflictDoNothing();
  }

  async listAssignments(): Promise<UserRoleAssignmentRow[]> {
    return this.db.select().from(userRoleAssignments);
  }
  async countAssignments(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(userRoleAssignments);
    return r[0]?.n ?? 0;
  }
  async assignRole(row: InsertUserRoleAssignment): Promise<UserRoleAssignmentRow> {
    const id = `URA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [r] = await this.db.insert(userRoleAssignments).values({ ...row, id }).returning();
    return r;
  }
  async unassignRole(userId: string, roleId: string): Promise<void> {
    await this.db.delete(userRoleAssignments)
      .where(and(eq(userRoleAssignments.userId, userId), eq(userRoleAssignments.roleId, roleId)));
  }
  async bulkInsertAssignments(rows: InsertUserRoleAssignment[]): Promise<void> {
    if (rows.length === 0) return;
    const withIds = rows.map((r, i) => ({
      ...r,
      id: `URA-SEED-${Date.now()}-${i}`,
    }));
    await this.db.insert(userRoleAssignments).values(withIds).onConflictDoNothing();
  }

  async listAuditLog(opts: {
    actorUserId?: string;
    targetType?: string;
    targetId?: string;
    since?: Date;
    until?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ rows: AuditLogRow[]; total: number }> {
    const conds = [];
    if (opts.actorUserId) conds.push(eq(auditLog.actorUserId, opts.actorUserId));
    if (opts.targetType) conds.push(eq(auditLog.targetType, opts.targetType));
    if (opts.targetId) conds.push(eq(auditLog.targetId, opts.targetId));
    if (opts.since) conds.push(gte(auditLog.createdAt, opts.since));
    if (opts.until) conds.push(lt(auditLog.createdAt, opts.until));
    const whereClause = conds.length > 0 ? and(...conds) : undefined;

    const limit = Math.min(500, Math.max(1, opts.limit ?? 100));
    const offset = Math.max(0, opts.offset ?? 0);

    const baseQuery = this.db.select().from(auditLog);
    const rows = await (whereClause ? baseQuery.where(whereClause) : baseQuery)
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)
      .offset(offset);

    const countQuery = this.db.select({ n: sql<number>`count(*)::int` }).from(auditLog);
    const totalRow = await (whereClause ? countQuery.where(whereClause) : countQuery);
    return { rows, total: totalRow[0]?.n ?? 0 };
  }
  async appendAudit(row: InsertAuditLog): Promise<AuditLogRow> {
    const id = `AL-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [r] = await this.db.insert(auditLog).values({ ...row, id }).returning();
    return r;
  }

  async listCustomerActions(customerId: string, limit = 50): Promise<CustomerActionRow[]> {
    return this.db
      .select()
      .from(customerActions)
      .where(eq(customerActions.customerId, customerId))
      .orderBy(desc(customerActions.createdAt))
      .limit(limit);
  }

  async appendCustomerAction(row: InsertCustomerAction): Promise<CustomerActionRow> {
    const id = `CA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [r] = await this.db.insert(customerActions).values({ ...row, id }).returning();
    return r;
  }

  async listRules(): Promise<RuleRow[]> {
    return this.db.select().from(rules).orderBy(desc(rules.updatedAt));
  }
  async getRule(id: string): Promise<RuleRow | undefined> {
    const r = await this.db.select().from(rules).where(eq(rules.id, id)).limit(1);
    return r[0];
  }
  async createRule(row: InsertRule): Promise<RuleRow> {
    const [r] = await this.db.insert(rules).values(row).returning();
    return r;
  }
  async updateRule(id: string, patch: Partial<InsertRule>): Promise<RuleRow | undefined> {
    const [r] = await this.db
      .update(rules)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(rules.id, id))
      .returning();
    return r;
  }
  async deleteRule(id: string): Promise<boolean> {
    const r = await this.db.delete(rules).where(eq(rules.id, id)).returning({ id: rules.id });
    return r.length > 0;
  }
  async countRules(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(rules);
    return r[0]?.n ?? 0;
  }
  async bulkInsertRules(rows: InsertRule[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(rules).values(rows).onConflictDoNothing();
  }

  async appendRuleSimulation(row: InsertRuleSimulation): Promise<RuleSimulationRow> {
    const id = `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const [r] = await this.db.insert(ruleSimulations).values({ ...row, id }).returning();
    return r;
  }
  async listRuleSimulations(ruleId: string, limit = 25): Promise<RuleSimulationRow[]> {
    return this.db
      .select()
      .from(ruleSimulations)
      .where(eq(ruleSimulations.ruleId, ruleId))
      .orderBy(desc(ruleSimulations.performedAt))
      .limit(limit);
  }

  // ==========================================================================
  // Dashboard aggregates
  // ==========================================================================

  async getDashboardKpis(): Promise<DashboardKpisPayload> {
    // Pull a few small aggregate result-sets in parallel.
    const [
      txnTodayRows, txnYesterdayRows, channelTodayRows, alertsRows,
      casesOpenRows, fraudSavedRows, exposureRows, suspiciousRows, pyramidRows,
    ] = await Promise.all([
      this.db.execute(sql`
        select count(*)::int as n, coalesce(sum(amount),0)::float as vol
        from transactions where timestamp >= now() - interval '1 day'
      `),
      this.db.execute(sql`
        select count(*)::int as n
        from transactions
        where timestamp >= now() - interval '2 day' and timestamp < now() - interval '1 day'
      `),
      this.db.execute(sql`
        select channel, count(*)::int as n
        from transactions where timestamp >= now() - interval '1 day'
        group by channel
      `),
      this.db.execute(sql`
        select severity, status, count(*)::int as n
        from alerts group by severity, status
      `),
      this.db.execute(sql`
        select count(*)::int as n from cases where status not in ('closed','resolved')
      `),
      this.db.execute(sql`
        select coalesce(sum(amount_saved),0)::float as saved
        from fraud_register where reported_date >= date_trunc('month', now())
      `),
      this.db.execute(sql`
        select coalesce(sum(amount),0)::float as exposure, count(*)::int as n
        from transactions where risk_level in ('high','critical') and status != 'declined'
      `),
      this.db.execute(sql`
        select count(distinct customer_id)::int as n
        from transactions where risk_level in ('high','critical')
          and timestamp >= now() - interval '1 day'
      `),
      this.db.execute(sql`
        select
          case
            when risk_score >= 85 then 'Critical'
            when risk_score >= 70 then 'High'
            when risk_score >= 40 then 'Medium'
            else 'Low'
          end as tier,
          count(*)::int as n,
          coalesce(sum(amount),0)::float as exposure
        from transactions group by 1
      `),
    ]);

    const today = (txnTodayRows.rows[0] ?? {}) as { n?: number; vol?: number };
    const yest  = (txnYesterdayRows.rows[0] ?? {}) as { n?: number };
    const tCount = today.n ?? 0;
    const yCount = yest.n ?? 0;
    const txnTrend = yCount > 0 ? +(((tCount - yCount) / yCount) * 100).toFixed(1) : 0;

    const totalToday = (channelTodayRows.rows as Array<{ channel: string; n: number }>)
      .reduce((s, r) => s + Number(r.n), 0) || 1;
    const channelDetails: Record<string, string | number> = {};
    for (const r of channelTodayRows.rows as Array<{ channel: string; n: number }>) {
      channelDetails[r.channel.toUpperCase()] = `${Math.round((Number(r.n) / totalToday) * 100)}%`;
    }

    let alertsOpen = 0, alertsCritical = 0, alertsTotal = 0, alertsHighSev = 0;
    for (const r of alertsRows.rows as Array<{ severity: string; status: string; n: number }>) {
      const n = Number(r.n);
      alertsTotal += n;
      if (r.status !== "closed" && r.status !== "resolved") alertsOpen += n;
      if (r.severity === "critical") alertsCritical += n;
      if (r.severity === "critical" || r.severity === "high") alertsHighSev += n;
    }
    const detectionRate = alertsTotal > 0 ? +((alertsHighSev / alertsTotal) * 100).toFixed(1) : 0;

    const casesOpen = Number((casesOpenRows.rows[0] as { n?: number })?.n ?? 0);
    const fraudSaved = Number((fraudSavedRows.rows[0] as { saved?: number })?.saved ?? 0);
    const exposureRow = (exposureRows.rows[0] ?? {}) as { exposure?: number; n?: number };
    const exposureNgn = Number(exposureRow.exposure ?? 0);
    const highRiskTxns = Number(exposureRow.n ?? 0);
    const suspicious = Number((suspiciousRows.rows[0] as { n?: number })?.n ?? 0);

    const tierOrder: RiskPyramidTier["tier"][] = ["Critical", "High", "Medium", "Low"];
    const pyramidMap = new Map<string, { count: number; exposure: number }>();
    for (const r of pyramidRows.rows as Array<{ tier: string; n: number; exposure: number }>) {
      pyramidMap.set(r.tier, { count: Number(r.n), exposure: Number(r.exposure) });
    }
    const totalPyramid = Array.from(pyramidMap.values()).reduce((s, v) => s + v.count, 0) || 1;
    const riskPyramid: RiskPyramidTier[] = tierOrder.map(tier => {
      const v = pyramidMap.get(tier) ?? { count: 0, exposure: 0 };
      return { tier, count: v.count, exposure: v.exposure, pct: +((v.count / totalPyramid) * 100).toFixed(1) };
    });

    const fmtNgn = (n: number) =>
      n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M`
      : n >= 1_000   ? `₦${(n / 1_000).toFixed(1)}K`
      : `₦${Math.round(n)}`;

    const cards = [
      {
        label: "Transactions Today",
        value: tCount.toLocaleString(),
        subtitle: `${fmtNgn(Number(today.vol ?? 0))} volume`,
        trend: { value: txnTrend, label: "vs yesterday" },
        details: { "Yesterday": yCount.toLocaleString(), ...channelDetails },
        variant: "default" as const,
      },
      {
        label: "Fraud Detection Rate",
        value: `${detectionRate}%`,
        subtitle: `${alertsHighSev} high-sev / ${alertsTotal} alerts`,
        trend: { value: 0, label: "of alerts critical+high" },
        details: { "Critical": alertsCritical, "Total alerts": alertsTotal, "Open": alertsOpen },
        variant: detectionRate > 30 ? "warning" as const : "success" as const,
      },
      {
        label: "Open Alerts",
        value: alertsOpen.toLocaleString(),
        subtitle: `${casesOpen} active cases`,
        trend: { value: 0, label: "live count" },
        details: { "Critical": alertsCritical, "High+Crit": alertsHighSev, "Cases open": casesOpen },
        variant: alertsCritical > 0 ? "warning" as const : "default" as const,
      },
      {
        label: "Amount Saved",
        value: fmtNgn(fraudSaved),
        subtitle: "Fraud prevented this month",
        trend: { value: 0, label: "month-to-date" },
        details: { "Source": "fraud_register" },
        variant: "success" as const,
      },
      {
        label: "Risk Exposure",
        value: fmtNgn(exposureNgn),
        subtitle: "High/critical-risk open transactions",
        trend: { value: 0, label: "rolling" },
        details: { "High-risk txns": highRiskTxns },
        variant: "danger" as const,
      },
      {
        label: "Suspicious Entities",
        value: suspicious.toLocaleString(),
        subtitle: "Distinct customers w/ high-risk txns 24h",
        trend: { value: 0, label: "last 24h" },
        details: { "Open alerts": alertsOpen, "Critical alerts": alertsCritical },
        variant: suspicious > 10 ? "warning" as const : "default" as const,
      },
    ];

    return { cards, riskPyramid, generatedAt: new Date().toISOString() };
  }

  async getDashboardTrends(window: "24h" | "7d" | "30d"): Promise<DashboardTrendsPayload> {
    // Map window → channel-breakdown lookback (the volume series and 30d fraud
    // trend are fixed in shape; window controls the channel-breakdown horizon).
    const channelInterval =
      window === "24h" ? sql`interval '1 day'` :
      window === "30d" ? sql`interval '30 day'` :
      sql`interval '7 day'`;
    // Volume series length scales with window: 1 day → 24 hourly buckets,
    // 7d → 7 daily, 30d → 30 daily. Always emit a complete date axis from
    // SQL `generate_series` so empty days show as zeros without timezone drift.
    const volumeSpec =
      window === "24h"
        ? { trunc: sql.raw("'hour'"), step: sql`interval '1 hour'`, span: sql`interval '23 hour'` }
        : window === "30d"
        ? { trunc: sql.raw("'day'"),  step: sql`interval '1 day'`,  span: sql`interval '29 day'` }
        : { trunc: sql.raw("'day'"),  step: sql`interval '1 day'`,  span: sql`interval '6 day'` };

    const [channelRows, volumeRows, fraudRows] = await Promise.all([
      this.db.execute(sql`
        select channel, count(*)::int as volume,
          sum(case when risk_level in ('high','critical') then 1 else 0 end)::int as fraud
        from transactions where timestamp >= now() - ${channelInterval}
        group by channel
      `),
      this.db.execute(sql`
        with axis as (
          select generate_series(
            date_trunc(${volumeSpec.trunc}, now()) - ${volumeSpec.span},
            date_trunc(${volumeSpec.trunc}, now()),
            ${volumeSpec.step}
          ) as bucket
        ),
        agg as (
          select date_trunc(${volumeSpec.trunc}, timestamp) as bucket, channel,
                 count(*)::int as n
          from transactions
          where timestamp >= date_trunc(${volumeSpec.trunc}, now()) - ${volumeSpec.span}
          group by 1, 2
        )
        select axis.bucket, agg.channel, coalesce(agg.n, 0)::int as n
        from axis left join agg on agg.bucket = axis.bucket
        order by axis.bucket
      `),
      this.db.execute(sql`
        with axis as (
          select generate_series(
            date_trunc('day', now()) - interval '29 day',
            date_trunc('day', now()),
            interval '1 day'
          ) as day
        ),
        agg as (
          select date_trunc('day', timestamp) as day,
            count(*)::int as total,
            sum(case when risk_level in ('high','critical') then 1 else 0 end)::int as fraud
          from transactions where timestamp >= date_trunc('day', now()) - interval '29 day'
          group by 1
        )
        select axis.day, coalesce(agg.total, 0)::int as total, coalesce(agg.fraud, 0)::int as fraud
        from axis left join agg on agg.day = axis.day
        order by axis.day
      `),
    ]);

    const channelTotal = (channelRows.rows as Array<{ channel: string; volume: number; fraud: number }>)
      .reduce((s, r) => s + Number(r.volume), 0) || 1;
    const channelBreakdown: ChannelBreakdownEntry[] =
      (channelRows.rows as Array<{ channel: string; volume: number; fraud: number }>).map(r => ({
        channel: r.channel.toUpperCase(),
        volume: Number(r.volume),
        pct: Math.round((Number(r.volume) / channelTotal) * 100),
        fraud: Number(r.fraud),
      })).sort((a, b) => b.volume - a.volume);

    const isHourly = window === "24h";
    const labelFmt: Intl.DateTimeFormatOptions = isHourly
      ? { hour: "numeric", hour12: true }
      : { weekday: "short", month: "short", day: "numeric" };
    const buckets = new Map<string, TxnVolumeBucket>();
    for (const r of volumeRows.rows as Array<{ bucket: Date | string; channel: string | null; n: number }>) {
      const d = r.bucket instanceof Date ? r.bucket : new Date(r.bucket);
      const key = d.toISOString();
      let b = buckets.get(key);
      if (!b) {
        b = {
          date: key,
          label: d.toLocaleString("en-US", labelFmt),
          total: 0, pos: 0, web: 0, mobile: 0, atm: 0, branch: 0, fraudMarkers: 0,
        };
        buckets.set(key, b);
      }
      if (!r.channel) continue;
      const n = Number(r.n);
      b.total += n;
      const ch = r.channel as keyof TxnVolumeBucket;
      if (ch === "pos" || ch === "web" || ch === "mobile" || ch === "atm" || ch === "branch") {
        (b[ch] as number) = ((b[ch] as number) ?? 0) + n;
      }
    }

    const fraudPoints = (fraudRows.rows as Array<{ day: Date | string; total: number; fraud: number }>)
      .map(r => {
        const d = r.day instanceof Date ? r.day : new Date(r.day);
        const total = Number(r.total);
        const actual = total > 0 ? +((Number(r.fraud) / total) * 100).toFixed(2) : 0;
        return { date: d.toISOString(), actual, total };
      });
    // Expected = trailing-7 average; anomaly = actual > expected + 1.5pp.
    const fraudTrend30d: FraudTrendPoint[] = fraudPoints.map((p, i) => {
      const win = fraudPoints.slice(Math.max(0, i - 6), i + 1);
      const expected = +(win.reduce((s, x) => s + x.actual, 0) / win.length).toFixed(2);
      return {
        date: p.date,
        actual: p.actual,
        expected,
        prediction: i >= fraudPoints.length - 3 ? p.actual : null,
        isAnomaly: p.actual > expected + 1.5 && p.actual > 0,
      };
    });

    return { window, channelBreakdown, txnVolume7d: Array.from(buckets.values()), fraudTrend30d };
  }

  async getComplianceSnapshot(): Promise<ComplianceSnapshotPayload> {
    const [custRows, regRows, fraudRows, eddRows] = await Promise.all([
      this.db.execute(sql`
        select
          sum(case when kyc_status = 'verified' then 1 else 0 end)::int as verified,
          sum(case when kyc_status <> 'verified' then 1 else 0 end)::int as unverified,
          sum(case when risk_level = 'high' then 1 else 0 end)::int as high_risk,
          sum(case when pep_flag then 1 else 0 end)::int as pep,
          sum(case when sanction_flag then 1 else 0 end)::int as sanction
        from customers
      `),
      this.db.execute(sql`
        select
          sum(case when type = 'STR' and status in ('submitted','acknowledged')
                    and submitted_at >= date_trunc('month', now()) then 1 else 0 end)::int as str_submitted,
          sum(case when type = 'STR' and status in ('draft','pending_review') then 1 else 0 end)::int as str_pending,
          sum(case when type = 'STR' and status not in ('submitted','acknowledged')
                    and deadline < now() then 1 else 0 end)::int as str_overdue,
          sum(case when type = 'CTR' then 1 else 0 end)::int as ctr_flags
        from regulatory_reports
      `),
      this.db.execute(sql`
        select
          coalesce(sum(amount_lost - amount_recovered), 0)::float as loss_ytd,
          coalesce(sum(amount_saved), 0)::float as prevented_ytd
        from fraud_register where reported_date >= date_trunc('year', now())
      `),
      this.db.execute(sql`
        select
          sum(case when status in ('required','in_progress') then 1 else 0 end)::int as edd_open,
          sum(case when status not in ('approved','rejected') and due_date < now() then 1 else 0 end)::int as edd_overdue
        from edd_cases
      `),
    ]);

    const c = (custRows.rows[0] ?? {}) as Record<string, number>;
    const r = (regRows.rows[0]  ?? {}) as Record<string, number>;
    const f = (fraudRows.rows[0]?? {}) as Record<string, number>;
    const e = (eddRows.rows[0]  ?? {}) as Record<string, number>;
    return {
      verifiedCustomers: Number(c.verified ?? 0),
      unverifiedCustomers: Number(c.unverified ?? 0),
      highRiskCustomers: Number(c.high_risk ?? 0),
      pepMatches: Number(c.pep ?? 0),
      sanctionsMatches: Number(c.sanction ?? 0),
      strSubmittedThisMonth: Number(r.str_submitted ?? 0),
      strPending: Number(r.str_pending ?? 0),
      strOverdue: Number(r.str_overdue ?? 0),
      ctrFlags: Number(r.ctr_flags ?? 0),
      fraudLossYtd: Number(f.loss_ytd ?? 0),
      fraudPreventedYtd: Number(f.prevented_ytd ?? 0),
      eddOpen: Number(e.edd_open ?? 0),
      eddOverdue: Number(e.edd_overdue ?? 0),
    };
  }

  // ==========================================================================
  // Analytics aggregates
  // ==========================================================================

  async getAnalytics<T extends AnalyticsTab>(tab: T, filters: AnalyticsFiltersInput): Promise<AnalyticsTabPayloadMap[T]> {
    return getAnalyticsTab(this.db, tab, filters);
  }

  // Graph Network derivation
  // ==========================================================================
  /**
   * Build the Graph Network workspace payload (nodes, edges, KPIs) directly
   * from live tables. Customer rows become nodes; edges are derived from
   * transactions (sent_money via beneficiary_account match), shared device_id
   * on transactions, and shared external beneficiary accounts. Layout is
   * computed deterministically (concentric rings by risk band) so the SVG
   * code in src/pages/Graph.tsx can render without changes.
   */
  async getGraphNetwork(opts: {
    window?: "24h" | "7d" | "30d" | "all";
    riskLevel?: string;
    entityType?: string;
    edgeType?: string;
    limit?: number;
  } = {}): Promise<GraphNetworkPayload> {
    const limit = Math.min(Math.max(opts.limit ?? 60, 5), 200);
    const windowInterval =
      opts.window === "24h" ? sql`interval '1 day'` :
      opts.window === "7d"  ? sql`interval '7 day'` :
      opts.window === "30d" ? sql`interval '30 day'` :
      sql`interval '365 day'`;

    // Pick the most "interesting" customers within the window — biased toward
    // those with transaction activity, alerts, and open cases. Capped at
    // `limit` so a 50k-customer table still renders in well under a second.
    const candRowsRaw = await this.db.execute(sql`
      with txn_stats as (
        select customer_id,
          count(*)::int as txn_count,
          coalesce(sum(amount), 0)::float as total_amount,
          coalesce(avg(risk_score), 0)::float as avg_risk,
          count(*) filter (where timestamp >= now() - interval '7 day')::int as recent_count
        from transactions
        where timestamp >= now() - ${windowInterval}
        group by customer_id
      ),
      alert_counts as (
        select customer_id, count(*)::int as alerts
        from alerts group by customer_id
      ),
      case_counts as (
        select customer_id, count(*)::int as open_cases
        from cases where status not in ('closed','resolved') group by customer_id
      )
      select c.id, c.display_name, c.risk_level, c.pep_flag, c.sanction_flag, c.fraud_risk_flag,
        c.address, c.account_number,
        coalesce(ts.txn_count, 0)::int as txn_count,
        coalesce(ts.total_amount, 0)::float as total_amount,
        coalesce(ts.avg_risk, 0)::float as avg_risk,
        coalesce(ts.recent_count, 0)::int as recent_count,
        coalesce(ac.alerts, 0)::int as alert_count,
        coalesce(cc.open_cases, 0)::int as open_cases
      from customers c
      left join txn_stats ts on ts.customer_id = c.id
      left join alert_counts ac on ac.customer_id = c.id
      left join case_counts cc on cc.customer_id = c.id
      order by (coalesce(ts.txn_count, 0)
                + coalesce(ac.alerts, 0) * 5
                + coalesce(cc.open_cases, 0) * 10
                + (case when c.sanction_flag then 50 else 0 end)
                + (case when c.pep_flag then 25 else 0 end)
                + (case when c.fraud_risk_flag then 20 else 0 end)) desc
      limit ${limit}
    `);
    type CandRow = {
      id: string; display_name: string; risk_level: string;
      pep_flag: boolean; sanction_flag: boolean; fraud_risk_flag: boolean;
      address: { country?: string } | null; account_number: string | null;
      txn_count: number; total_amount: number; avg_risk: number; recent_count: number;
      alert_count: number; open_cases: number;
    };
    const candRows = candRowsRaw.rows as CandRow[];

    function deriveRisk(c: CandRow): { score: number; band: GraphRiskBand } {
      let score = c.risk_level === "high" ? 75 : c.risk_level === "medium" ? 50 : 15;
      if (c.pep_flag) score += 12;
      if (c.sanction_flag) score += 18;
      if (c.fraud_risk_flag) score += 10;
      if (c.avg_risk) score += Math.min(15, Math.round(Number(c.avg_risk) / 10));
      score = Math.max(0, Math.min(100, Math.round(score)));
      let band: GraphRiskBand;
      if (c.sanction_flag || score >= 85) band = "critical";
      else if (c.fraud_risk_flag || score >= 70) band = "high";
      else if (score >= 40) band = "medium";
      else band = "low";
      return { score, band };
    }

    let enriched = candRows.map((r) => {
      const { score, band } = deriveRisk(r);
      const country = (r.address && typeof r.address === "object" && r.address.country) || "NG";
      return {
        id: r.id,
        displayName: r.display_name,
        riskBand: band,
        riskScore: score,
        jurisdiction: country,
        txnCount: Number(r.txn_count),
        totalAmount: Number(r.total_amount),
        openCases: Number(r.open_cases),
        alerts: Number(r.alert_count),
        velocity: Math.round((Number(r.recent_count) / 7) * 10) / 10,
        accountNumber: r.account_number || "",
      };
    });

    if (opts.riskLevel && opts.riskLevel !== "all") {
      enriched = enriched.filter((n) => n.riskBand === opts.riskLevel);
    }

    if (enriched.length === 0) {
      return {
        nodes: [], edges: [],
        kpis: { totalNodes: 0, totalEdges: 0, highRiskPct: 0, sharedDeviceEdges: 0, crossBorderEdges: 0, velocitySpikes: 0 },
        truncated: false,
        generatedAt: new Date().toISOString(),
      };
    }

    const ids = enriched.map((n) => n.id);
    const idsSql = sql.join(ids.map((i) => sql`${i}`), sql`, `);

    const [smRes, sdRes, sipRes, sadRes, cbRes, caRes] = await Promise.all([
      // sent_money: customer → customer where the recipient's account_number
      // matches transactions.beneficiary_account.
      this.db.execute(sql`
        select t.customer_id as src, c2.id as dst,
          count(*)::int as txn_count,
          coalesce(sum(t.amount), 0)::float as total_amount,
          coalesce(avg(t.risk_score), 0)::float as avg_risk,
          bool_or(t.timestamp >= now() - interval '7 day') as is_recent
        from transactions t
        join customers c2 on c2.account_number = t.beneficiary_account
          and coalesce(c2.account_number, '') <> ''
        where t.timestamp >= now() - ${windowInterval}
          and t.customer_id in (${idsSql})
          and c2.id in (${idsSql})
          and t.customer_id <> c2.id
        group by 1, 2
      `),
      // shared_device: any pair of selected customers that ever transacted on
      // the same device_id within the window. a.customer_id < b.customer_id
      // de-dups undirected pairs.
      this.db.execute(sql`
        with dev as (
          select device_id, customer_id, max(timestamp) as last_seen
          from transactions
          where coalesce(device_id, '') <> ''
            and timestamp >= now() - ${windowInterval}
            and customer_id in (${idsSql})
          group by device_id, customer_id
        )
        select a.customer_id as src, b.customer_id as dst,
          count(distinct a.device_id)::int as device_count,
          bool_or(greatest(a.last_seen, b.last_seen) >= now() - interval '7 day') as is_recent
        from dev a
        join dev b on a.device_id = b.device_id and a.customer_id < b.customer_id
        group by 1, 2
      `),
      // shared_ip: pairs of selected customers seen on the same ip_address
      // within the window. Mirrors the shared_device structure.
      this.db.execute(sql`
        with ip as (
          select ip_address, customer_id, max(timestamp) as last_seen
          from transactions
          where coalesce(ip_address, '') <> ''
            and timestamp >= now() - ${windowInterval}
            and customer_id in (${idsSql})
          group by ip_address, customer_id
        )
        select a.customer_id as src, b.customer_id as dst,
          count(distinct a.ip_address)::int as ip_count,
          bool_or(greatest(a.last_seen, b.last_seen) >= now() - interval '7 day') as is_recent
        from ip a
        join ip b on a.ip_address = b.ip_address and a.customer_id < b.customer_id
        group by 1, 2
      `),
      // shared_address: pairs of selected customers whose KYC address
      // (street + city + state + country) collides exactly. JSON equality
      // via jsonb_path_query keeps the join cheap and indexable.
      this.db.execute(sql`
        with addr as (
          select id as customer_id,
            (address->>'street') || '|' || (address->>'city') || '|' ||
            (address->>'state') || '|' || (address->>'country') as akey
          from customers
          where address is not null
            and address->>'street' is not null
            and id in (${idsSql})
        )
        select a.customer_id as src, b.customer_id as dst,
          1::int as addr_count
        from addr a
        join addr b on a.akey = b.akey and a.customer_id < b.customer_id
      `),
      // common_beneficiary: pairs that share an *external* beneficiary
      // (excluded if the beneficiary maps to one of our customers — that case
      // already shows up under sent_money).
      this.db.execute(sql`
        with ext as (
          select t.beneficiary_account, t.customer_id,
            count(*)::int as n,
            coalesce(sum(t.amount), 0)::float as total,
            bool_or(t.timestamp >= now() - interval '7 day') as recent
          from transactions t
          where coalesce(t.beneficiary_account, '') <> ''
            and t.timestamp >= now() - ${windowInterval}
            and t.customer_id in (${idsSql})
            and not exists (
              select 1 from customers c
              where coalesce(c.account_number, '') = t.beneficiary_account
            )
          group by 1, 2
        )
        select a.customer_id as src, b.customer_id as dst,
          count(distinct a.beneficiary_account)::int as ben_count,
          (sum(a.n) + sum(b.n))::int as txn_count,
          (sum(a.total) + sum(b.total))::float as total_amount,
          bool_or(a.recent or b.recent) as is_recent
        from ext a
        join ext b on a.beneficiary_account = b.beneficiary_account
          and a.customer_id < b.customer_id
        group by 1, 2
      `),
      // linked_account (case association): pairs of selected customers that
      // share an open or in-progress case via cases.linked_entities. The
      // linkedEntities JSON column carries IDs in `entityId`, so a Postgres
      // `jsonb_array_elements ->> 'entityId'` extraction gives us the join key.
      this.db.execute(sql`
        with case_links as (
          select c.id as case_id,
            (le ->> 'entityId') as customer_id
          from cases c,
            jsonb_array_elements(coalesce(c.linked_entities, '[]'::jsonb)) le
          where c.status not in ('closed', 'resolved')
            and (le ->> 'entityId') in (${idsSql})
          union
          select id as case_id, customer_id
          from cases
          where status not in ('closed', 'resolved')
            and customer_id in (${idsSql})
        )
        select a.customer_id as src, b.customer_id as dst,
          count(distinct a.case_id)::int as case_count
        from case_links a
        join case_links b on a.case_id = b.case_id and a.customer_id < b.customer_id
        group by 1, 2
      `),
    ]);

    const edges: GraphNetworkEdge[] = [];

    for (const r of smRes.rows as Array<{ src: string; dst: string; txn_count: number; total_amount: number; avg_risk: number; is_recent: boolean }>) {
      edges.push({
        from: r.src, to: r.dst,
        relationshipType: "sent_money",
        txnCount: Number(r.txn_count),
        totalAmount: Math.round(Number(r.total_amount)),
        riskScore: Math.max(0, Math.min(100, Math.round(Number(r.avg_risk)))),
        isRecent: !!r.is_recent,
      });
    }
    for (const r of sdRes.rows as Array<{ src: string; dst: string; device_count: number; is_recent: boolean }>) {
      edges.push({
        from: r.src, to: r.dst,
        relationshipType: "shared_device",
        txnCount: Number(r.device_count),
        totalAmount: 0,
        riskScore: Math.min(100, 50 + Number(r.device_count) * 8),
        isRecent: !!r.is_recent,
      });
    }
    for (const r of sipRes.rows as Array<{ src: string; dst: string; ip_count: number; is_recent: boolean }>) {
      edges.push({
        from: r.src, to: r.dst,
        relationshipType: "shared_ip",
        txnCount: Number(r.ip_count),
        totalAmount: 0,
        riskScore: Math.min(100, 45 + Number(r.ip_count) * 7),
        isRecent: !!r.is_recent,
      });
    }
    for (const r of sadRes.rows as Array<{ src: string; dst: string; addr_count: number }>) {
      edges.push({
        from: r.src, to: r.dst,
        relationshipType: "shared_address",
        txnCount: Number(r.addr_count),
        totalAmount: 0,
        riskScore: 55,
        isRecent: false,
      });
    }
    for (const r of cbRes.rows as Array<{ src: string; dst: string; ben_count: number; txn_count: number; total_amount: number; is_recent: boolean }>) {
      edges.push({
        from: r.src, to: r.dst,
        relationshipType: "common_beneficiary",
        txnCount: Number(r.txn_count),
        totalAmount: Math.round(Number(r.total_amount)),
        riskScore: Math.min(100, 30 + Number(r.ben_count) * 10),
        isRecent: !!r.is_recent,
      });
    }
    for (const r of caRes.rows as Array<{ src: string; dst: string; case_count: number }>) {
      edges.push({
        from: r.src, to: r.dst,
        relationshipType: "linked_account",
        txnCount: Number(r.case_count),
        totalAmount: 0,
        riskScore: Math.min(100, 60 + Number(r.case_count) * 10),
        isRecent: true,
      });
    }

    // Beneficiary entity nodes: external accounts that are either
    // (a) referenced by 2+ selected customers within the window, OR
    // (b) called out in any regulatory report (STR/CTR) tied to a
    //     selected customer — those beneficiaries are by definition
    //     evidence-grade and should always surface, even on a single hit.
    const benRes = await this.db.execute(sql`
      with txn_ben as (
        select t.beneficiary_account as ben,
          count(distinct t.customer_id)::int as fanin,
          coalesce(sum(t.amount), 0)::float as total,
          coalesce(avg(t.risk_score), 0)::float as avg_risk
        from transactions t
        where coalesce(t.beneficiary_account, '') <> ''
          and t.timestamp >= now() - ${windowInterval}
          and t.customer_id in (${idsSql})
          and not exists (
            select 1 from customers c
            where coalesce(c.account_number, '') = t.beneficiary_account
          )
        group by 1
        having count(distinct t.customer_id) >= 2
      ),
      report_ben as (
        select t.beneficiary_account as ben,
          count(distinct t.customer_id)::int as fanin,
          coalesce(sum(t.amount), 0)::float as total,
          coalesce(avg(t.risk_score), 0)::float as avg_risk
        from regulatory_reports r
        join transactions t on t.id = any(r.transaction_ids)
        where r.customer_id in (${idsSql})
          and coalesce(t.beneficiary_account, '') <> ''
          and not exists (
            select 1 from customers c
            where coalesce(c.account_number, '') = t.beneficiary_account
          )
        group by 1
      )
      select ben,
        sum(fanin)::int as fanin,
        sum(total)::float as total,
        avg(avg_risk)::float as avg_risk
      from (
        select * from txn_ben
        union all
        select * from report_ben
      ) u
      group by 1
      order by 2 desc
      limit 18
    `);
    type BenRow = { ben: string; fanin: number; total: number; avg_risk: number };
    const benNodes: Array<{ id: string; row: BenRow }> = (benRes.rows as BenRow[]).map((r) => ({
      id: `BEN-${r.ben}`,
      row: r,
    }));

    // Per-customer → external-beneficiary edges (only for the beneficiaries we
    // promoted to nodes above). These are also `common_beneficiary` edges so
    // the existing legend/colours keep working.
    if (benNodes.length > 0) {
      const benIds = benNodes.map((b) => b.row.ben);
      const benIdsSql = sql.join(benIds.map((b) => sql`${b}`), sql`, `);
      const benEdgeRes = await this.db.execute(sql`
        select t.customer_id as src, t.beneficiary_account as ben,
          count(*)::int as n, coalesce(sum(t.amount), 0)::float as total,
          coalesce(avg(t.risk_score), 0)::float as avg_risk,
          bool_or(t.timestamp >= now() - interval '7 day') as is_recent
        from transactions t
        where t.customer_id in (${idsSql})
          and t.beneficiary_account in (${benIdsSql})
          and t.timestamp >= now() - ${windowInterval}
        group by 1, 2
      `);
      for (const r of benEdgeRes.rows as Array<{ src: string; ben: string; n: number; total: number; avg_risk: number; is_recent: boolean }>) {
        edges.push({
          from: r.src,
          to: `BEN-${r.ben}`,
          relationshipType: "common_beneficiary",
          txnCount: Number(r.n),
          totalAmount: Math.round(Number(r.total)),
          riskScore: Math.max(0, Math.min(100, Math.round(Number(r.avg_risk)))),
          isRecent: !!r.is_recent,
        });
      }
    }

    const conn = new Map<string, number>();
    for (const e of edges) {
      conn.set(e.from, (conn.get(e.from) ?? 0) + 1);
      conn.set(e.to, (conn.get(e.to) ?? 0) + 1);
    }

    // Concentric-ring layout: critical nearest center, low furthest out.
    // A small per-band angular offset keeps rings from aligning visually.
    const ringRadius: Record<GraphRiskBand, number> = { critical: 8, high: 19, medium: 30, low: 40 };
    const groups: Record<GraphRiskBand, typeof enriched> = { critical: [], high: [], medium: [], low: [] };
    for (const n of enriched) groups[n.riskBand].push(n);

    const nodes: GraphNetworkNode[] = [];
    (["critical", "high", "medium", "low"] as GraphRiskBand[]).forEach((band, ringIdx) => {
      const arr = groups[band];
      const r = ringRadius[band];
      arr.forEach((n, idx) => {
        const angle = (idx / Math.max(arr.length, 1)) * Math.PI * 2 + ringIdx * 0.4;
        const x = 50 + Math.cos(angle) * r;
        const y = 50 + Math.sin(angle) * r;
        nodes.push({
          id: n.id,
          label: n.displayName,
          type: "customer",
          risk: n.riskBand,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          connections: conn.get(n.id) ?? 0,
          transactions30d: n.txnCount,
          totalAmount: n.totalAmount,
          openCases: n.openCases,
          riskScore: n.riskScore,
          alerts: n.alerts,
          jurisdiction: n.jurisdiction,
          velocity: n.velocity,
        });
      });
    });

    // Place beneficiary entity nodes around the outermost ring at radius 48.
    benNodes.forEach((b, idx) => {
      const angle = (idx / Math.max(benNodes.length, 1)) * Math.PI * 2 + 0.15;
      const x = 50 + Math.cos(angle) * 48;
      const y = 50 + Math.sin(angle) * 48;
      const avgRisk = Math.max(0, Math.min(100, Math.round(Number(b.row.avg_risk))));
      const band: GraphRiskBand =
        avgRisk >= 80 ? "critical" : avgRisk >= 60 ? "high" : avgRisk >= 35 ? "medium" : "low";
      nodes.push({
        id: b.id,
        label: b.row.ben,
        type: "account",
        risk: band,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        connections: conn.get(b.id) ?? 0,
        transactions30d: 0,
        totalAmount: Math.round(Number(b.row.total)),
        openCases: 0,
        riskScore: avgRisk,
        alerts: 0,
        jurisdiction: "External",
        velocity: 0,
      });
    });

    // Server-side entity/edge type filters (defence-in-depth: keep payload
    // minimal so the client doesn't have to throw rows away after fetch).
    let filteredNodes = nodes;
    let filteredEdges = edges;
    if (opts.entityType && opts.entityType !== "all") {
      filteredNodes = filteredNodes.filter((n) => n.type === opts.entityType);
      const keep = new Set(filteredNodes.map((n) => n.id));
      filteredEdges = filteredEdges.filter((e) => keep.has(e.from) && keep.has(e.to));
    }
    if (opts.edgeType && opts.edgeType !== "all") {
      filteredEdges = filteredEdges.filter((e) => e.relationshipType === opts.edgeType);
    }

    const nodeJur = new Map(filteredNodes.map((n) => [n.id, n.jurisdiction] as const));
    const sharedDeviceEdges = filteredEdges.filter((e) => e.relationshipType === "shared_device").length;
    const crossBorderEdges = filteredEdges.filter((e) => {
      const a = nodeJur.get(e.from), b = nodeJur.get(e.to);
      return !!a && !!b && a !== b;
    }).length;
    const highRiskNodes = filteredNodes.filter((n) => n.risk === "high" || n.risk === "critical").length;
    const highRiskPct = filteredNodes.length > 0 ? Math.round((highRiskNodes / filteredNodes.length) * 100) : 0;
    const velocitySpikes = filteredNodes.filter((n) => n.velocity > 6).length;

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      kpis: {
        totalNodes: filteredNodes.length,
        totalEdges: filteredEdges.length,
        highRiskPct,
        sharedDeviceEdges,
        crossBorderEdges,
        velocitySpikes,
      },
      truncated: candRows.length >= limit,
      generatedAt: new Date().toISOString(),
    };
  }

  // ==========================================================================
  // AI chat sessions
  // ==========================================================================

  async listChatSessions(opts: { ownerUserId?: string; limit?: number } = {}): Promise<ChatSessionRow[]> {
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const base = this.db.select().from(chatSessions);
    const q = opts.ownerUserId
      ? base.where(eq(chatSessions.ownerUserId, opts.ownerUserId))
      : base;
    return q.orderBy(desc(chatSessions.updatedAt)).limit(limit);
  }
  async getChatSession(id: string): Promise<ChatSessionRow | undefined> {
    const r = await this.db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);
    return r[0];
  }
  async createChatSession(row: InsertChatSession): Promise<ChatSessionRow> {
    const [r] = await this.db.insert(chatSessions).values(row).returning();
    return r;
  }
  async updateChatSession(id: string, patch: Partial<InsertChatSession>): Promise<ChatSessionRow | undefined> {
    const [r] = await this.db
      .update(chatSessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(chatSessions.id, id))
      .returning();
    return r;
  }
  async deleteChatSession(id: string): Promise<boolean> {
    const r = await this.db.delete(chatSessions).where(eq(chatSessions.id, id)).returning({ id: chatSessions.id });
    return r.length > 0;
  }

  // ==========================================================================
  // Report artifacts
  // ==========================================================================

  async listReportArtifacts(reportId: string): Promise<ReportArtifactRow[]> {
    return this.db
      .select()
      .from(reportArtifacts)
      .where(eq(reportArtifacts.reportId, reportId))
      .orderBy(desc(reportArtifacts.createdAt));
  }
  async getReportArtifact(id: string): Promise<ReportArtifactRow | undefined> {
    const r = await this.db.select().from(reportArtifacts).where(eq(reportArtifacts.id, id)).limit(1);
    return r[0];
  }
  async createReportArtifact(row: InsertReportArtifact): Promise<ReportArtifactRow> {
    const [r] = await this.db.insert(reportArtifacts).values(row).returning();
    return r;
  }
  async nextArtifactVersion(reportId: string, kind: string): Promise<number> {
    const r = await this.db
      .select({ n: sql<number>`coalesce(max(${reportArtifacts.version}),0)::int` })
      .from(reportArtifacts)
      .where(and(eq(reportArtifacts.reportId, reportId), eq(reportArtifacts.kind, kind)));
    return (r[0]?.n ?? 0) + 1;
  }

  // ==========================================================================
  // Models + Evaluations
  // ==========================================================================
  async listModels(): Promise<ModelRow[]> {
    return this.db.select().from(models).orderBy(desc(models.updatedAt));
  }
  async getModel(id: string): Promise<ModelRow | undefined> {
    const r = await this.db.select().from(models).where(eq(models.id, id)).limit(1);
    return r[0];
  }
  async countModels(): Promise<number> {
    const r = await this.db.select({ n: sql<number>`count(*)::int` }).from(models);
    return r[0]?.n ?? 0;
  }
  async createModel(row: InsertModel): Promise<ModelRow> {
    const [r] = await this.db.insert(models).values(row).returning();
    return r;
  }
  async updateModel(id: string, patch: Partial<InsertModel>): Promise<ModelRow | undefined> {
    const [r] = await this.db
      .update(models)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(models.id, id))
      .returning();
    return r;
  }
  async bulkInsertModels(rows: InsertModel[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(models).values(rows).onConflictDoNothing();
  }
  async nextModelId(): Promise<string> {
    const r = await this.db.execute(sql`
      select coalesce(max(substring(id from 'MODEL-([0-9]+)')::int), 0) + 1 as n
      from models where id ~ '^MODEL-[0-9]+$'
    `);
    const n = Number((r.rows[0] as { n?: number })?.n ?? 1);
    return `MODEL-${String(n).padStart(3, "0")}`;
  }

  async getLatestEvaluation(modelId: string): Promise<ModelEvaluationRow | undefined> {
    const r = await this.db
      .select()
      .from(modelEvaluations)
      .where(eq(modelEvaluations.modelId, modelId))
      .orderBy(desc(modelEvaluations.generatedAt))
      .limit(1);
    return r[0];
  }
  async upsertEvaluation(row: InsertModelEvaluation): Promise<ModelEvaluationRow> {
    const [r] = await this.db.insert(modelEvaluations).values(row).returning();
    return r;
  }
  async bulkInsertEvaluations(rows: InsertModelEvaluation[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.insert(modelEvaluations).values(rows).onConflictDoNothing();
  }
}

let _storage: IStorage | null = null;
export function getStorage(): IStorage {
  if (!_storage) _storage = new DrizzleStorage();
  return _storage;
}
