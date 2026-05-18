import { sql, type SQL } from "drizzle-orm";
import type { getDb as GetDbFn } from "./db.js";
import type {
  AnalyticsFiltersInput, AnalyticsTab, AnalyticsTabPayloadMap,
  AnalyticsExecutivePayload, AnalyticsFraudPayload, AnalyticsAmlPayload,
  AnalyticsModelsPayload, AnalyticsRulesPayload, AnalyticsGeographyPayload,
  AnalyticsChannelsPayload, AnalyticsUsersPayload, AnalyticsOperationsPayload,
  AnalyticsAuditPayload,
} from "../shared/schema.js";

type Db = ReturnType<typeof GetDbFn>;

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function intervalFor(range: AnalyticsFiltersInput["timeRange"]): SQL {
  switch (range) {
    case "24h": return sql`interval '1 day'`;
    case "7d":  return sql`interval '7 day'`;
    case "30d": return sql`interval '30 day'`;
    case "90d": return sql`interval '90 day'`;
  }
}

// Build a (channel, country) WHERE fragment for transactions. Always returns
// a non-empty SQL chunk (TRUE) so callers can `AND` it without conditionals.
function txnFilter(f: AnalyticsFiltersInput): SQL {
  const parts: SQL[] = [sql`true`];
  if (f.channel !== "all") parts.push(sql`channel = ${f.channel}`);
  if (f.country && f.country !== "all") {
    parts.push(sql`(geo_location->>'country') = ${f.country}`);
  }
  return sql.join(parts, sql` and `);
}

// Sparse rows[{ym, ...}] → dense 12-month series (oldest → newest). Calls
// `pick` on either the matched DB row or `undefined` for missing months so the
// caller controls how to project numeric fields onto the series shape.
function densifyMonths<T>(
  rows: Array<Record<string, unknown> & { ym?: string }>,
  pick: (r: Record<string, unknown> | undefined, label: string) => T,
): T[] {
  const map = new Map<string, Record<string, unknown>>();
  for (const r of rows) if (r.ym) map.set(String(r.ym), r);
  const out: T[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    out.push(pick(map.get(ym), MONTH_LABELS[d.getUTCMonth()]));
  }
  return out;
}

function asNum(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// ---------------------------------------------------------------------------
// Executive
// ---------------------------------------------------------------------------
async function getExecutive(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsExecutivePayload> {
  const interval = intervalFor(f.timeRange);
  const tf = txnFilter(f);
  const [criticalAlerts, fpAlerts, fraudLossRow, openCases] = await Promise.all([
    db.execute(sql`select count(*)::int as n from alerts where severity in ('critical','high') and created_at >= now() - ${interval}`),
    db.execute(sql`
      select count(*) filter (where resolution = 'false_positive')::int as fp,
             count(*)::int as total
      from alerts where created_at >= now() - ${interval}`),
    db.execute(sql`select coalesce(sum(amount_lost - amount_recovered),0)::float as loss
      from fraud_register where reported_date >= now() - ${interval}`),
    db.execute(sql`
      with f as (select * from transactions where timestamp >= now() - ${interval} and ${tf})
      select count(distinct customer_id)::int as n from f where risk_level in ('high','critical')`),
  ]);
  const crit = asNum((criticalAlerts.rows[0] as { n?: number })?.n);
  const fpRow = (fpAlerts.rows[0] ?? {}) as { fp?: number; total?: number };
  const fp = asNum(fpRow.fp), total = asNum(fpRow.total);
  const fpRate = total > 0 ? +((fp / total) * 100).toFixed(1) : 0;
  const loss = asNum((fraudLossRow.rows[0] as { loss?: number })?.loss);
  const susp = asNum((openCases.rows[0] as { n?: number })?.n);

  const insights: AnalyticsExecutivePayload["insights"] = [];
  if (crit > 0) insights.push({
    severity: crit > 50 ? "critical" : "warning",
    text: `${crit} high/critical alerts in the ${f.timeRange} window — investigate top-risk customers and merchants.`,
    metric: `${crit} alerts`,
    evidence: `Alerts where severity in (critical, high) created in the last ${f.timeRange}.`,
  });
  if (fpRate > 15) insights.push({
    severity: "warning",
    text: `False positive rate is ${fpRate}% — consider tuning noisy rules.`,
    metric: `${fpRate}% FP`,
    evidence: `${fp} of ${total} alerts closed as false positives in the ${f.timeRange} window.`,
  });
  if (loss > 0) insights.push({
    severity: loss > 1_000_000 ? "critical" : "info",
    text: `Net fraud loss recorded: ₦${Math.round(loss).toLocaleString()} (after recoveries).`,
    metric: `₦${Math.round(loss / 1000)}K`,
    evidence: `Sum of (amount_lost - amount_recovered) from fraud_register in the ${f.timeRange} window.`,
  });
  if (susp > 0) insights.push({
    severity: susp > 20 ? "warning" : "info",
    text: `${susp} distinct customers with high/critical-risk transactions need review.`,
    metric: `${susp} customers`,
    evidence: `Distinct customer_id from transactions with risk_level in (high, critical) in the ${f.timeRange} window.`,
  });
  if (insights.length === 0) insights.push({
    severity: "info",
    text: "No significant anomalies detected in the selected window.",
    metric: "Stable",
    evidence: `No high/critical alerts, false-positive spikes, or losses recorded for the last ${f.timeRange}.`,
  });

  return {
    insights,
    recommendedActions: [
      { text: "Review pending high-severity alerts", linkTo: "/alerts", priority: "high" },
      { text: "Inspect open investigation cases", linkTo: "/cases", priority: "high" },
      { text: "Tune noisy rules in the rules engine", linkTo: "/rules", priority: "medium" },
      { text: "Schedule the next quarterly typology review", linkTo: "/cases", priority: "low" },
    ],
  };
}

// ---------------------------------------------------------------------------
// Fraud
// ---------------------------------------------------------------------------
async function getFraud(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsFraudPayload> {
  const interval = intervalFor(f.timeRange);
  const tf = txnFilter(f);
  const [
    alertsRow, frRow, funnelRow, typologyRows, ruleRows,
    merchantRows, devRows, custRows, fraudTrendRows,
  ] = await Promise.all([
    db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where severity in ('critical','high'))::int as detected,
        count(*) filter (where resolution = 'false_positive')::int as fp,
        count(*) filter (where resolution = 'confirmed_fraud')::int as confirmed
      from alerts where created_at >= now() - ${interval}`),
    db.execute(sql`
      select coalesce(sum(amount_saved),0)::float as prevented,
             coalesce(sum(amount_lost - amount_recovered),0)::float as loss
      from fraud_register where reported_date >= now() - ${interval}`),
    db.execute(sql`
      select
        count(*)::int as flagged,
        count(*) filter (where status not in ('open'))::int as reviewed,
        count(*) filter (where status in ('escalated','investigating'))::int as escalated,
        count(*) filter (where resolution = 'confirmed_fraud')::int as confirmed
      from alerts where created_at >= now() - ${interval}`),
    db.execute(sql`
      select a.type as type, count(*)::int as n,
             coalesce(sum(t.amount),0)::float as value
      from alerts a left join transactions t on t.id = a.transaction_id
      where a.created_at >= now() - ${interval}
      group by a.type order by n desc limit 5`),
    db.execute(sql`
      with x as (
        select unnest(a.rule_ids) as rule_id, a.resolution
        from alerts a where a.created_at >= now() - ${interval}
      )
      select r.id, r.name,
             count(x.rule_id)::int as triggers,
             count(*) filter (where x.resolution = 'confirmed_fraud')::int as confirmed
      from rules r left join x on x.rule_id = r.id
      group by r.id, r.name
      order by confirmed desc, triggers desc limit 5`),
    db.execute(sql`
      with tx as (
        select id, merchant_id, merchant_name, risk_score,
               coalesce((geo_location->>'country'), 'Unknown') as country
        from transactions
        where timestamp >= now() - ${interval} and ${tf}
          and merchant_name <> '' and risk_score >= 60
      )
      select tx.merchant_id as id, tx.merchant_name as name,
             max(tx.risk_score)::int as risk_score,
             count(*)::int as volume,
             tx.country,
             count(a.id) filter (where a.resolution = 'confirmed_fraud')::int as confirmed_fraud
      from tx left join alerts a on a.transaction_id = tx.id
      group by tx.merchant_id, tx.merchant_name, tx.country
      order by risk_score desc, volume desc limit 5`),
    db.execute(sql`
      select device_id, max(timestamp) as last_seen, count(*)::int as n,
             max(risk_score)::int as risk_score
      from transactions
      where timestamp >= now() - ${interval} and ${tf}
        and device_id <> '' and risk_score >= 50
      group by device_id order by risk_score desc limit 5`),
    db.execute(sql`
      with c as (
        select c.id, c.display_name as name, c.risk_level,
               c.pep_flag, c.sanction_flag, c.fraud_risk_flag,
               (select count(*)::int from alerts a where a.customer_id = c.id) as alerts,
               (select count(*)::int from cases ks where ks.customer_id = c.id) as cases
        from customers c
        where c.risk_level in ('high','critical') or c.fraud_risk_flag = true
      )
      select * from c order by alerts desc, cases desc limit 5`),
    db.execute(sql`
      select to_char(date_trunc('month', timestamp), 'YYYY-MM') as ym,
             count(*) filter (where risk_level in ('high','critical'))::int as detected,
             count(*) filter (where status = 'declined')::int as prevented,
             coalesce(sum(amount) filter (where status = 'completed' and risk_level = 'critical'),0)::float as loss
      from transactions where timestamp >= now() - interval '12 month' and ${tf}
      group by 1`),
  ]);

  const a = (alertsRow.rows[0] ?? {}) as { total?: number; detected?: number; fp?: number; confirmed?: number };
  const total = asNum(a.total), detected = asNum(a.detected), fp = asNum(a.fp), confirmed = asNum(a.confirmed);
  const detectionRate = total > 0 ? +((detected / total) * 100).toFixed(1) : 0;
  const fpRate = total > 0 ? +((fp / total) * 100).toFixed(1) : 0;
  const fr = (frRow.rows[0] ?? {}) as { prevented?: number; loss?: number };
  const fn = (funnelRow.rows[0] ?? {}) as { flagged?: number; reviewed?: number; escalated?: number; confirmed?: number };

  const fraudTrend = densifyMonths(
    fraudTrendRows.rows as Array<Record<string, unknown>>,
    (r, label) => ({
      month: label,
      detected: asNum(r?.detected),
      prevented: asNum(r?.prevented),
      actualLoss: asNum(r?.loss),
    }),
  );

  return {
    detectionRate: { value: detectionRate, delta: 0, definition: "% of alerts in window that were high/critical severity." },
    preventedValue: { value: `₦${Math.round(asNum(fr.prevented) / 1000)}K`, delta: 0, definition: "Sum of amount_saved on fraud_register in window." },
    confirmedLoss: { value: `₦${Math.round(asNum(fr.loss) / 1000)}K`, delta: 0, definition: "Sum of amount_lost − amount_recovered in window." },
    falsePositiveRate: { value: fpRate, delta: 0, definition: "% alerts closed as false_positive in window." },
    avgTimeToDetect: { value: "—", delta: 0, definition: "Not currently instrumented; pending detection telemetry." },
    avgTimeToContain: { value: "—", delta: 0, definition: "Not currently instrumented; pending response telemetry." },
    fraudTrend,
    alertFunnel: {
      flagged: asNum(fn.flagged),
      reviewed: asNum(fn.reviewed),
      escalated: asNum(fn.escalated),
      confirmedFraud: confirmed,
      sarFiled: 0,
    },
    topTypologies: (typologyRows.rows as Array<{ type: string; n: number; value: number }>).map(r => ({
      name: r.type, count: asNum(r.n), value: asNum(r.value), trend: 0,
    })),
    topDriverRules: (ruleRows.rows as Array<{ id: string; name: string; triggers: number; confirmed: number }>).map(r => ({
      name: `${r.id} ${r.name}`, confirmedFraud: asNum(r.confirmed), triggers: asNum(r.triggers),
    })),
    riskyMerchants: (merchantRows.rows as Array<{ id: string; name: string; risk_score: number; volume: number; country: string; confirmed_fraud: number }>).map(r => ({
      id: r.id || "—", name: r.name, riskScore: asNum(r.risk_score),
      volume: asNum(r.volume), confirmedFraud: asNum(r.confirmed_fraud), country: r.country,
    })),
    riskyCustomers: (custRows.rows as Array<{ id: string; name: string; risk_level: string; pep_flag: boolean; sanction_flag: boolean; fraud_risk_flag: boolean; alerts: number; cases: number }>).map(r => ({
      id: r.id, name: r.name,
      riskScore: r.risk_level === "critical" ? 95 : r.risk_level === "high" ? 80 : 60,
      flags: [
        r.pep_flag ? "pep" : null,
        r.sanction_flag ? "sanction" : null,
        r.fraud_risk_flag ? "fraud_risk" : null,
      ].filter((x): x is string => !!x),
      linkedCases: asNum(r.cases),
    })),
    riskyDevices: (devRows.rows as Array<{ device_id: string; last_seen: string | Date; risk_score: number }>).map(r => ({
      id: r.device_id,
      type: "device",
      trustLevel: Math.max(0, 100 - asNum(r.risk_score)),
      geoMismatch: false,
      lastSeen: (r.last_seen instanceof Date ? r.last_seen : new Date(r.last_seen)).toISOString(),
    })),
  };
}

// ---------------------------------------------------------------------------
// AML
// ---------------------------------------------------------------------------
async function getAml(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsAmlPayload> {
  const interval = intervalFor(f.timeRange);
  const [alertsRow, sarsRow, structRow, sancRow, typologyRows, sarPipeRow, custRows, cpRows, trendRows] = await Promise.all([
    db.execute(sql`
      select count(*)::int as total,
             count(*) filter (where status in ('escalated','investigating'))::int as escalations
      from alerts where type in ('aml','kyc_risk','pep_match','sanction','edd_required')
        and created_at >= now() - ${interval}`),
    db.execute(sql`
      select count(*)::int as filed
      from regulatory_reports
      where type = 'STR' and status in ('submitted','acknowledged')
        and (submitted_at is not null and submitted_at >= now() - ${interval})`),
    db.execute(sql`
      select count(*)::int as n
      from alerts where (lower(description) like '%struct%' or lower(description) like '%smurf%')
        and created_at >= now() - ${interval}`),
    db.execute(sql`
      select count(*)::int as n
      from screening_matches
      where screening_type = 'sanction' and detected_at >= now() - ${interval}`),
    db.execute(sql`
      select type, count(*)::int as n
      from alerts where type in ('aml','kyc_risk','pep_match','sanction','edd_required')
        and created_at >= now() - ${interval}
      group by type order by n desc`),
    db.execute(sql`
      select
        count(*) filter (where type = 'STR' and status = 'draft')::int as drafted,
        count(*) filter (where type = 'STR' and status = 'pending_review')::int as reviewed,
        count(*) filter (where type = 'STR' and status = 'approved')::int as approved,
        count(*) filter (where type = 'STR' and status in ('submitted','acknowledged'))::int as filed
      from regulatory_reports`),
    db.execute(sql`
      select id, display_name as name, risk_level, pep_flag, sanction_flag,
             total_volume as exposure
      from customers
      where risk_level in ('high','critical') or pep_flag = true or sanction_flag = true
      order by total_volume desc nulls last limit 5`),
    db.execute(sql`
      select id, display_name as name, total_volume as exposure,
             coalesce(address->>'country', 'Unknown') as country, risk_level
      from customers where type = 'business'
      order by total_volume desc nulls last limit 5`),
    db.execute(sql`
      with am as (
        select date_trunc('month', a.created_at) as m,
               count(*)::int as alerts,
               count(*) filter (where a.status in ('escalated','investigating'))::int as escalations
        from alerts a
        where a.created_at >= now() - interval '12 month'
          and a.type in ('aml','kyc_risk','pep_match','sanction','edd_required')
        group by 1
      ),
      sr as (
        select date_trunc('month', submitted_at) as m, count(*)::int as sars
        from regulatory_reports
        where type = 'STR' and status in ('submitted','acknowledged')
          and submitted_at >= now() - interval '12 month'
        group by 1
      )
      select to_char(am.m, 'YYYY-MM') as ym,
             am.alerts, am.escalations, coalesce(sr.sars, 0) as sars
      from am left join sr on sr.m = am.m`),
  ]);

  const al = (alertsRow.rows[0] ?? {}) as { total?: number; escalations?: number };
  const total = asNum(al.total);
  const typology = typologyRows.rows as Array<{ type: string; n: number }>;
  const typologyTotal = typology.reduce((s, r) => s + asNum(r.n), 0) || 1;
  const sp = (sarPipeRow.rows[0] ?? {}) as Record<string, number>;

  return {
    alertCount: { value: total, delta: 0, definition: "Total AML/KYC/sanction/PEP/EDD alerts in window." },
    escalations: { value: asNum(al.escalations), delta: 0, definition: "Alerts in escalated/investigating status." },
    sarsFiled: { value: asNum((sarsRow.rows[0] as { filed?: number })?.filed), delta: 0, definition: "STRs submitted/acknowledged in window." },
    avgEscalationTime: { value: "—", delta: 0, definition: "Not currently instrumented." },
    structuringCount: { value: asNum((structRow.rows[0] as { n?: number })?.n), delta: 0, definition: "Alerts whose description matches structuring/smurfing." },
    sanctionsHits: { value: asNum((sancRow.rows[0] as { n?: number })?.n), delta: 0, definition: "Sanction screening matches detected in window." },
    amlTrend: densifyMonths(
      trendRows.rows as Array<Record<string, unknown>>,
      (r, label) => ({
        month: label,
        alerts: asNum(r?.alerts),
        escalations: asNum(r?.escalations),
        sarsFiled: asNum(r?.sars),
      }),
    ),
    typologyDistribution: typology.map(r => ({
      name: r.type, count: asNum(r.n), percentage: +((asNum(r.n) / typologyTotal) * 100).toFixed(1),
    })),
    sarPipeline: {
      drafted: asNum(sp.drafted), reviewed: asNum(sp.reviewed),
      approved: asNum(sp.approved), filed: asNum(sp.filed),
    },
    highRiskCustomers: (custRows.rows as Array<{ id: string; name: string; risk_level: string; pep_flag: boolean; sanction_flag: boolean; exposure: number }>).map(r => ({
      id: r.id, name: r.name,
      riskScore: r.risk_level === "critical" ? 95 : r.risk_level === "high" ? 80 : 60,
      typologyTags: [r.pep_flag ? "pep" : null, r.sanction_flag ? "sanction" : null].filter((x): x is string => !!x),
      exposure: asNum(r.exposure),
    })),
    counterpartyRisk: (cpRows.rows as Array<{ id: string; name: string; exposure: number; country: string; risk_level: string }>).map(r => ({
      id: r.id, name: r.name, exposure: asNum(r.exposure), country: r.country, riskLevel: r.risk_level,
    })),
  };
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------
async function getModels(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsModelsPayload> {
  const interval = intervalFor(f.timeRange);
  // ml_models is an optional table — wrap its lookups so a missing relation
  // (older deployments without the model registry) degrades gracefully.
  const safeQuery = async <R>(q: Promise<R>, fallback: R): Promise<R> => {
    try { return await q; } catch (e) {
      const cause = (e as { cause?: { code?: string } })?.cause;
      if (cause?.code === "42P01") return fallback;
      throw e;
    }
  };
  const emptyRows = { rows: [] as Array<Record<string, unknown>> };
  const [active, all, scoreRows, confusion] = await Promise.all([
    safeQuery(db.execute(sql`select id, name, version, metrics from ml_models where is_active = true order by trained_at desc limit 1`), emptyRows),
    safeQuery(db.execute(sql`select id, name, version, metrics from ml_models order by trained_at desc limit 5`), emptyRows),
    db.execute(sql`
      select width_bucket(risk_score, 0, 100, 10) as b, count(*)::int as n
      from transactions where timestamp >= now() - ${interval}
      group by 1 order by 1`),
    db.execute(sql`
      select
        count(*) filter (where resolution = 'confirmed_fraud')::int as tp,
        count(*) filter (where resolution = 'false_positive')::int as fp,
        count(*) filter (where resolution = 'pending')::int as fn_,
        (select count(*)::int from transactions where timestamp >= now() - ${interval} and risk_level not in ('high','critical')) as tn
      from alerts where created_at >= now() - ${interval}`),
  ]);

  const a0 = (active.rows[0] ?? {}) as { id?: string; name?: string; version?: string; metrics?: Record<string, number> | null };
  const m = a0.metrics ?? {};
  const num = (k: string) => asNum(m[k]);
  const score = scoreRows.rows as Array<{ b: number; n: number }>;
  const distMap = new Map<number, number>();
  for (const r of score) distMap.set(asNum(r.b), asNum(r.n));
  const scoreDistribution: AnalyticsModelsPayload["scoreDistribution"] = [];
  for (let i = 1; i <= 10; i++) {
    scoreDistribution.push({ bucket: `${(i - 1) * 10}-${i * 10}`, count: distMap.get(i) ?? 0 });
  }
  const cm = (confusion.rows[0] ?? {}) as { tp?: number; fp?: number; tn?: number; fn_?: number };

  return {
    precision: { value: num("precision") || 0, delta: 0, definition: "Active model precision (from ml_models.metrics)." },
    recall: { value: num("recall") || 0, delta: 0, definition: "Active model recall." },
    f1: { value: num("f1") || 0, delta: 0, definition: "Active model F1." },
    auc: { value: num("auc") || 0, delta: 0, definition: "Active model AUC." },
    featureDrift: { value: num("featureDrift") || 0, delta: 0, definition: "Feature distribution drift index." },
    predictionDrift: { value: num("predictionDrift") || 0, delta: 0, definition: "Prediction distribution drift." },
    dataQuality: { value: num("dataQuality") || 0, delta: 0, definition: "Input feature data-quality score." },
    latencyP50: { value: m.latencyP50 != null ? `${m.latencyP50}ms` : "—", delta: 0, definition: "Median inference latency." },
    latencyP95: { value: m.latencyP95 != null ? `${m.latencyP95}ms` : "—", delta: 0, definition: "p95 inference latency." },
    modelVersion: { value: a0.version ?? "n/a", delta: 0, definition: "Currently deployed model version." },
    performanceComparison: (all.rows as Array<{ name: string; metrics: Record<string, number> | null }>).map(r => ({
      name: r.name,
      precision: asNum(r.metrics?.precision),
      recall: asNum(r.metrics?.recall),
      f1: asNum(r.metrics?.f1),
      auc: asNum(r.metrics?.auc),
    })),
    driftTrend: await computeDriftTrend(db),
    scoreDistribution,
    confusionMatrix: { tp: asNum(cm.tp), fp: asNum(cm.fp), tn: asNum(cm.tn), fn: asNum(cm.fn_) },
  };
}

// Drift proxy: month-over-month delta in mean transaction risk_score (feature
// drift) and mean ml_probability (prediction drift). Returned values are
// absolute deltas in 0..100 risk-score units / 0..100% probability units.
async function computeDriftTrend(db: Db): Promise<{ month: string; featureDrift: number; predictionDrift: number }[]> {
  const r = await db.execute(sql`
    select to_char(date_trunc('month', timestamp), 'YYYY-MM') as ym,
           avg(risk_score)::float as mean_score,
           avg(ml_probability)::float as mean_prob
    from transactions
    where timestamp >= now() - interval '13 month'
    group by 1 order by 1`);
  const rows = r.rows as Array<{ ym: string; mean_score: number; mean_prob: number }>;
  const byYm = new Map(rows.map(x => [x.ym, x] as const));
  let prev: { mean_score: number; mean_prob: number } | undefined;
  return densifyMonths(
    rows as Array<Record<string, unknown>>,
    (raw, label) => {
      const ym = (raw as { ym?: string })?.ym;
      const cur = ym ? byYm.get(ym) : undefined;
      let featureDrift = 0, predictionDrift = 0;
      if (cur && prev) {
        featureDrift = +Math.abs(asNum(cur.mean_score) - asNum(prev.mean_score)).toFixed(2);
        predictionDrift = +Math.abs(asNum(cur.mean_prob) - asNum(prev.mean_prob)).toFixed(3);
      }
      if (cur) prev = cur;
      return { month: label, featureDrift, predictionDrift };
    },
  );
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------
async function getRules(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsRulesPayload> {
  const interval = intervalFor(f.timeRange);
  // Per-rule stats: unnest alerts.rule_ids (text[]) so each (rule, alert)
  // pairing becomes a row, then aggregate counts/value.
  const [aggRow, lastRow, rulesRows, windowAlerts, perRuleStats, perRuleTrend] = await Promise.all([
    db.execute(sql`select coalesce(sum(triggered_count),0)::int as triggers from rules`),
    db.execute(sql`select max(updated_at) as ts from rules`),
    db.execute(sql`select id, name, category, triggered_count, updated_at, is_active
                   from rules order by triggered_count desc limit 50`),
    db.execute(sql`
      select count(*)::int as window_triggers,
             count(*) filter (where resolution = 'confirmed_fraud')::int as confirmed,
             count(*) filter (where resolution = 'false_positive')::int as fp
      from alerts where created_at >= now() - ${interval}`),
    db.execute(sql`
      with x as (
        select unnest(a.rule_ids) as rule_id, a.id as alert_id, a.resolution, a.transaction_id
        from alerts a where a.created_at >= now() - ${interval}
      )
      select x.rule_id,
             count(*)::int as triggers,
             count(*) filter (where x.resolution = 'confirmed_fraud')::int as confirmed,
             count(*) filter (where x.resolution = 'false_positive')::int as fp,
             coalesce(sum(t.amount) filter (where x.resolution = 'confirmed_fraud'),0)::float as net_value
      from x left join transactions t on t.id = x.transaction_id
      group by x.rule_id`),
    db.execute(sql`
      with x as (
        select unnest(a.rule_ids) as rule_id,
               (extract(day from (now() - a.created_at)))::int as days_ago
        from alerts a where a.created_at >= now() - ${interval}
      )
      select rule_id, days_ago, count(*)::int as n
      from x where days_ago between 0 and 6
      group by rule_id, days_ago`),
  ]);
  const triggers = asNum((aggRow.rows[0] as { triggers?: number })?.triggers);
  const lastTs = (lastRow.rows[0] as { ts?: Date | string | null })?.ts;
  const lastTuned = lastTs ? new Date(lastTs).toISOString().slice(0, 10) : "—";
  const wa = (windowAlerts.rows[0] ?? {}) as { window_triggers?: number; confirmed?: number; fp?: number };
  const windowTriggers = asNum(wa.window_triggers);
  const confirmedRate = windowTriggers > 0 ? +((asNum(wa.confirmed) / windowTriggers) * 100).toFixed(1) : 0;
  const noiseRate = windowTriggers > 0 ? +((asNum(wa.fp) / windowTriggers) * 100).toFixed(1) : 0;

  const statsByRule = new Map<string, { triggers: number; confirmed: number; fp: number; netValue: number }>();
  for (const r of perRuleStats.rows as Array<{ rule_id: string; triggers: number; confirmed: number; fp: number; net_value: number }>) {
    statsByRule.set(r.rule_id, { triggers: asNum(r.triggers), confirmed: asNum(r.confirmed), fp: asNum(r.fp), netValue: asNum(r.net_value) });
  }
  const trendByRule = new Map<string, number[]>();
  for (const r of perRuleTrend.rows as Array<{ rule_id: string; days_ago: number; n: number }>) {
    const arr = trendByRule.get(r.rule_id) ?? [0, 0, 0, 0, 0, 0, 0];
    // Index 6 = today, 0 = 6 days ago (left-to-right oldest → newest).
    const idx = 6 - asNum(r.days_ago);
    if (idx >= 0 && idx <= 6) arr[idx] = asNum(r.n);
    trendByRule.set(r.rule_id, arr);
  }

  return {
    totalTriggers: { value: triggers, delta: 0, definition: "Sum of triggered_count across all rules (lifetime)." },
    confirmedFraudRate: { value: confirmedRate, delta: 0, definition: `% of alerts in the ${f.timeRange} window resolved as confirmed_fraud.` },
    noiseRate: { value: noiseRate, delta: 0, definition: `% of alerts in the ${f.timeRange} window resolved as false_positive.` },
    avgTimeToReview: { value: "—", delta: 0, definition: "Not currently instrumented." },
    lastTunedDate: { value: lastTuned, delta: 0, definition: "Most recent rules.updated_at." },
    rulesTable: (rulesRows.rows as Array<{ id: string; name: string; category: string; triggered_count: number; updated_at: Date | string; is_active: boolean }>).map(r => {
      const s = statsByRule.get(r.id);
      const t = s?.triggers ?? 0;
      const trueFraudPct = t > 0 ? +(((s?.confirmed ?? 0) / t) * 100).toFixed(1) : 0;
      const noisePct = t > 0 ? +(((s?.fp ?? 0) / t) * 100).toFixed(1) : 0;
      return {
        id: r.id, name: r.name, category: r.category,
        triggerCount: asNum(r.triggered_count),
        trueFraudPct,
        noisePct,
        netValuePrevented: Math.round(s?.netValue ?? 0),
        lastUpdated: new Date(r.updated_at).toISOString().slice(0, 10),
        status: r.is_active ? "active" : "inactive",
        triggerTrend: trendByRule.get(r.id) ?? [0, 0, 0, 0, 0, 0, 0],
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Geography
// ---------------------------------------------------------------------------
const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", GB: "United Kingdom", DE: "Germany", NG: "Nigeria",
  RU: "Russia", CN: "China", BR: "Brazil", JP: "Japan", AE: "UAE", CO: "Colombia",
  ZA: "South Africa", IN: "India", FR: "France", CA: "Canada", AU: "Australia",
};
function countryName(code: string): string { return COUNTRY_NAMES[code] ?? code; }

async function getGeography(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsGeographyPayload> {
  const interval = intervalFor(f.timeRange);
  const tf = txnFilter(f);
  const [countriesRows, anomalyRow] = await Promise.all([
    db.execute(sql`
      with t as (
        select coalesce(geo_location->>'country','Unknown') as country,
               channel, merchant_name, risk_score, customer_id
        from transactions
        where timestamp >= now() - ${interval} and ${tf}
      ),
      base as (
        select country,
               count(*)::int as txn_volume,
               avg(risk_score)::float as avg_risk,
               count(*) filter (where risk_score >= 70)::float as fraud_count
        from t group by country
      ),
      ch as (
        select distinct on (country) country, channel, count(*)::int as n
        from t group by country, channel
        order by country, n desc
      ),
      m as (
        select distinct on (country) country, merchant_name, count(*)::int as n
        from t where merchant_name <> '' group by country, merchant_name
        order by country, n desc
      ),
      al as (
        select coalesce(tx.geo_location->>'country','Unknown') as country,
               count(*)::int as alerts
        from alerts a
        join transactions tx on tx.id = a.transaction_id
        where a.created_at >= now() - ${interval}
        group by 1
      )
      select base.country, base.txn_volume, base.avg_risk, base.fraud_count,
             ch.channel as top_channel, m.merchant_name as top_merchant,
             coalesce(al.alerts, 0) as alerts
      from base
      left join ch on ch.country = base.country
      left join m on m.country = base.country
      left join al on al.country = base.country
      order by base.txn_volume desc limit 20`),
    db.execute(sql`
      select
        count(distinct customer_id) filter (where risk_score >= 70)::int as impossible_travel,
        count(distinct (geo_location->>'country')) filter (where timestamp >= now() - ${interval})::int as countries
      from transactions where timestamp >= now() - ${interval} and ${tf}`),
  ]);

  const countries = (countriesRows.rows as Array<{
    country: string; txn_volume: number; avg_risk: number; fraud_count: number;
    top_channel: string | null; top_merchant: string | null; alerts: number;
  }>).map(r => ({
    code: (r.country || "??").slice(0, 2).toUpperCase(),
    name: countryName((r.country || "Unknown")),
    txnVolume: asNum(r.txn_volume),
    alertRate: r.txn_volume > 0 ? +((asNum(r.alerts) / r.txn_volume) * 100).toFixed(2) : 0,
    fraudRate: r.txn_volume > 0 ? +((asNum(r.fraud_count) / r.txn_volume) * 100).toFixed(2) : 0,
    amlRiskScore: Math.round(asNum(r.avg_risk)),
    topMerchant: r.top_merchant ?? "—",
    topChannel: (r.top_channel ?? "—"),
  }));
  const an = (anomalyRow.rows[0] ?? {}) as { impossible_travel?: number; countries?: number };
  return {
    countries,
    geoAnomalies: {
      ipMismatchRate: 0,
      impossibleTravel: asNum(an.impossible_travel),
      firstSeenCountry: asNum(an.countries),
    },
  };
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------
async function getChannels(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsChannelsPayload> {
  const interval = intervalFor(f.timeRange);
  const tf = txnFilter(f);
  const [volRows, trendRows, funnelRows] = await Promise.all([
    db.execute(sql`
      with t as (select * from transactions where timestamp >= now() - ${interval} and ${tf}),
      al as (
        select tx.channel, count(*)::int as n,
               count(*) filter (where a.resolution = 'false_positive')::int as fp
        from alerts a join transactions tx on tx.id = a.transaction_id
        where a.created_at >= now() - ${interval}
        group by tx.channel
      )
      select t.channel,
             count(*)::int as volume,
             avg(t.risk_score)::float as risk,
             coalesce(al.n, 0) as alerts,
             coalesce(al.fp, 0) as fp
      from t left join al on al.channel = t.channel
      group by t.channel, al.n, al.fp`),
    db.execute(sql`
      select to_char(date_trunc('month', timestamp), 'YYYY-MM') as ym, channel,
             avg(risk_score)::float as risk
      from transactions where timestamp >= now() - interval '12 month' and ${tf}
      group by 1, 2`),
    db.execute(sql`
      select tx.channel,
             count(*)::int as flagged,
             count(*) filter (where a.status not in ('open'))::int as reviewed,
             count(*) filter (where a.resolution = 'confirmed_fraud')::int as confirmed
      from alerts a join transactions tx on tx.id = a.transaction_id
      where a.created_at >= now() - ${interval}
      group by tx.channel`),
  ]);

  const channelVolume = (volRows.rows as Array<{ channel: string; volume: number; risk: number; alerts: number; fp: number }>).map(r => ({
    name: r.channel.toUpperCase(),
    volume: asNum(r.volume),
    risk: Math.round(asNum(r.risk)),
    alertsPer1k: r.volume > 0 ? +((asNum(r.alerts) / r.volume) * 1000).toFixed(1) : 0,
    falsePositiveRate: r.alerts > 0 ? +((asNum(r.fp) / r.alerts) * 100).toFixed(1) : 0,
  }));

  const trendMap = new Map<string, Record<string, number>>();
  for (const r of trendRows.rows as Array<{ ym: string; channel: string; risk: number }>) {
    const m = trendMap.get(r.ym) ?? {};
    m[r.channel] = asNum(r.risk);
    trendMap.set(r.ym, m);
  }
  const channelRiskTrend = densifyMonths(
    Array.from(trendMap.entries()).map(([ym, v]) => ({ ym, ...v })),
    (r, label) => ({
      month: label,
      pos: Math.round(asNum(r?.pos)),
      web: Math.round(asNum(r?.web)),
      mobile: Math.round(asNum(r?.mobile)),
      atm: Math.round(asNum(r?.atm)),
      branch: Math.round(asNum(r?.branch)),
    }),
  );

  return {
    channelVolume,
    channelRiskTrend,
    channelFunnel: (funnelRows.rows as Array<{ channel: string; flagged: number; reviewed: number; confirmed: number }>).map(r => ({
      name: r.channel.toUpperCase(),
      flagged: asNum(r.flagged),
      reviewed: asNum(r.reviewed),
      confirmed: asNum(r.confirmed),
    })),
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
async function getUsers(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsUsersPayload> {
  const interval = intervalFor(f.timeRange);
  const [statsRow, loginsRows, failedRows, prodRows, roleRows, lastActions] = await Promise.all([
    db.execute(sql`
      select
        count(*)::int as total,
        count(*) filter (where last_login is not null and last_login >= now() - ${interval})::int as active,
        count(*) filter (where privilege_level in ('elevated','admin','root'))::int as privileged,
        count(*) filter (where mfa_enabled = true)::int as mfa,
        count(*) filter (where sso_provider <> 'none')::int as sso,
        coalesce(sum(failed_logins_24h),0)::int as failed24h,
        count(*) filter (where status = 'locked')::int as locked
      from users`),
    db.execute(sql`
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as ym, count(*)::int as n
      from audit_log where action = 'login' and created_at >= now() - interval '12 month'
      group by 1`),
    db.execute(sql`
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as ym, count(*)::int as n
      from audit_log where action in ('login_failed','failed_login') and created_at >= now() - interval '12 month'
      group by 1`),
    db.execute(sql`
      select assigned_to as name, count(*)::int as cases_handled
      from cases where assigned_to is not null
      group by assigned_to order by cases_handled desc limit 6`),
    db.execute(sql`select role, count(*)::int as n from users group by role order by n desc`),
    db.execute(sql`
      select u.id, u.name, u.last_login, u.last_activity_action, u.failed_logins_24h
      from users u
      where u.failed_logins_24h > 0 or u.status = 'locked'
      order by u.failed_logins_24h desc nulls last limit 5`),
  ]);

  const s = (statsRow.rows[0] ?? {}) as Record<string, number>;
  const total = asNum(s.total);

  return {
    totalUsers: { value: total, delta: 0, definition: "All registered users." },
    activeUsers: { value: asNum(s.active), delta: 0, definition: `Users with last_login in the ${f.timeRange} window.` },
    privilegedUsers: { value: asNum(s.privileged), delta: 0, definition: "Users with elevated/admin privilege level." },
    mfaAdoption: { value: total > 0 ? +((asNum(s.mfa) / total) * 100).toFixed(1) : 0, delta: 0, definition: "% users with MFA enabled." },
    ssoAdoption: { value: total > 0 ? +((asNum(s.sso) / total) * 100).toFixed(1) : 0, delta: 0, definition: "% users authenticating via SSO." },
    failedLogins24h: { value: asNum(s.failed24h), delta: 0, definition: "Sum of failed_logins_24h across users." },
    lockedUsers: { value: asNum(s.locked), delta: 0, definition: "Users currently in locked status." },
    loginsTrend: densifyMonths(
      loginsRows.rows as Array<Record<string, unknown>>,
      (r, label) => ({ month: label, logins: asNum(r?.n) }),
    ),
    failedLoginsTrend: densifyMonths(
      failedRows.rows as Array<Record<string, unknown>>,
      (r, label) => ({ month: label, failed: asNum(r?.n) }),
    ),
    analystProductivity: (prodRows.rows as Array<{ name: string; cases_handled: number }>).map(r => ({
      name: r.name, casesHandled: asNum(r.cases_handled), avgReviewTime: 0, slaBreaches: 0,
    })),
    unusualAccess: (lastActions.rows as Array<{ id: string; name: string; last_login: Date | string | null; last_activity_action: string; failed_logins_24h: number }>).map(r => ({
      userId: r.id, name: r.name,
      pattern: r.failed_logins_24h > 0 ? `${r.failed_logins_24h} failed logins in 24h` : "Account locked",
      exports: 0,
      unusualTime: false,
      lastAction: r.last_login ? new Date(r.last_login).toISOString() : new Date(0).toISOString(),
    })),
    roleDistribution: (roleRows.rows as Array<{ role: string; n: number }>).map(r => ({
      role: r.role, count: asNum(r.n),
    })),
  };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------
async function getOperations(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsOperationsPayload> {
  const interval = intervalFor(f.timeRange);
  // Open alerts/cases use the selected window so users see “new in last X”
  // rather than the full lifetime backlog. backlogTrend below compares the
  // current window against the immediately preceding window of equal length.
  const [statsRow, backlogRows, slaRows, agingRows, oldestRows, teamRows, deltaRow] = await Promise.all([
    db.execute(sql`
      select
        (select count(*)::int from alerts
          where status not in ('closed','resolved')
            and created_at >= now() - ${interval}) as open_alerts,
        (select count(*)::int from cases
          where status not in ('closed','resolved')
            and created_at >= now() - ${interval}) as open_cases,
        (select count(*)::int from cases where status not in ('closed','resolved')
           and due_date is not null and due_date < now() + interval '24 hour') as sla_risk`),
    db.execute(sql`
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as ym,
             count(*)::int as n, 'a' as kind
      from alerts where created_at >= now() - interval '12 month' group by 1
      union all
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as ym,
             count(*)::int as n, 'c' as kind
      from cases where created_at >= now() - interval '12 month' group by 1`),
    db.execute(sql`
      select to_char(date_trunc('month', created_at), 'YYYY-MM') as ym,
             count(*)::int as total,
             count(*) filter (where status in ('closed','resolved')
               and (due_date is null or updated_at <= due_date))::int as on_time
      from cases where created_at >= now() - interval '12 month' group by 1`),
    db.execute(sql`
      select
        case
          when extract(epoch from (now() - created_at))/3600 < 24 then '0-24h'
          when extract(epoch from (now() - created_at))/86400 < 3 then '1-3d'
          when extract(epoch from (now() - created_at))/86400 < 7 then '3-7d'
          when extract(epoch from (now() - created_at))/86400 < 14 then '7-14d'
          when extract(epoch from (now() - created_at))/86400 < 30 then '14-30d'
          else '30d+'
        end as bucket,
        count(*)::int as n
      from cases where status not in ('closed','resolved')
      group by 1`),
    db.execute(sql`
      select id, type, priority, assigned_to, created_at,
             extract(day from (now() - created_at))::int as age
      from cases
      where status not in ('closed','resolved')
        and created_at >= now() - ${interval}
      order by created_at asc limit 5`),
    db.execute(sql`
      select assigned_to as team,
             count(*) filter (where status in ('open','new'))::int as open,
             count(*) filter (where status in ('investigating','escalated'))::int as in_review,
             count(*) filter (where status not in ('closed','resolved')
               and due_date is not null and due_date < now())::int as breached
      from cases
      where assigned_to is not null
        and created_at >= now() - ${interval}
      group by assigned_to order by open desc limit 6`),
    db.execute(sql`
      select
        (select count(*)::int from alerts where created_at >= now() - ${interval}) +
        (select count(*)::int from cases where created_at >= now() - ${interval}) as cur,
        (select count(*)::int from alerts where created_at >= now() - 2 * ${interval}
           and created_at < now() - ${interval}) +
        (select count(*)::int from cases where created_at >= now() - 2 * ${interval}
           and created_at < now() - ${interval}) as prev`),
  ]);

  const s = (statsRow.rows[0] ?? {}) as Record<string, number>;
  // Combine alerts/cases backlog rows into per-month {alerts, cases}.
  const backlogMap = new Map<string, { alerts: number; cases: number }>();
  for (const r of backlogRows.rows as Array<{ ym: string; n: number; kind: string }>) {
    const cur = backlogMap.get(r.ym) ?? { alerts: 0, cases: 0 };
    if (r.kind === "a") cur.alerts = asNum(r.n);
    else cur.cases = asNum(r.n);
    backlogMap.set(r.ym, cur);
  }
  const backlogTrendData = densifyMonths(
    Array.from(backlogMap.entries()).map(([ym, v]) => ({ ym, alerts: v.alerts, cases: v.cases })),
    (r, label) => ({ month: label, alerts: asNum(r?.alerts), cases: asNum(r?.cases) }),
  );

  const slaComplianceTrend = densifyMonths(
    slaRows.rows as Array<Record<string, unknown>>,
    (r, label) => ({
      month: label,
      compliance: asNum(r?.total) > 0
        ? +((asNum(r?.on_time) / asNum(r?.total)) * 100).toFixed(1)
        : 0,
    }),
  );

  const agingOrder = ["0-24h","1-3d","3-7d","7-14d","14-30d","30d+"];
  const agingMap = new Map<string, number>();
  for (const r of agingRows.rows as Array<{ bucket: string; n: number }>) agingMap.set(r.bucket, asNum(r.n));
  const caseAging = agingOrder.map(b => ({ bucket: b, count: agingMap.get(b) ?? 0 }));

  return {
    openAlerts: { value: asNum(s.open_alerts), delta: 0, definition: "Alerts not in closed/resolved status." },
    openCases: { value: asNum(s.open_cases), delta: 0, definition: "Cases not in closed/resolved status." },
    slaBreachRisk: { value: asNum(s.sla_risk), delta: 0, definition: "Open cases with due_date in the next 24h." },
    avgTimeToTriage: { value: "—", delta: 0, definition: "Not currently instrumented." },
    avgTimeToResolution: { value: "—", delta: 0, definition: "Not currently instrumented." },
    backlogTrend: (() => {
      const d = (deltaRow.rows[0] ?? {}) as { cur?: number; prev?: number };
      const cur = asNum(d.cur), prev = asNum(d.prev);
      const pct = prev > 0 ? +(((cur - prev) / prev) * 100).toFixed(1) : 0;
      return {
        value: `${pct >= 0 ? "+" : ""}${pct}%`,
        delta: pct,
        definition: `New alerts+cases in the last ${f.timeRange} (${cur}) vs the prior ${f.timeRange} (${prev}).`,
      };
    })(),
    backlogTrendData,
    slaComplianceTrend,
    caseAging,
    oldestCases: (oldestRows.rows as Array<{ id: string; type: string; priority: string; assigned_to: string | null; age: number }>).map(r => ({
      id: r.id, title: `${r.type} case`, age: asNum(r.age), assignee: r.assigned_to ?? "Unassigned", priority: r.priority,
    })),
    teamQueues: (teamRows.rows as Array<{ team: string; open: number; in_review: number; breached: number }>).map(r => ({
      team: r.team, open: asNum(r.open), inReview: asNum(r.in_review), breached: asNum(r.breached),
    })),
  };
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
async function getAudit(db: Db, f: AnalyticsFiltersInput): Promise<AnalyticsAuditPayload> {
  const interval = intervalFor(f.timeRange);
  const r = await db.execute(sql`
    select id, actor_user_id, actor_name, action, target_type, target_id,
           metadata, created_at
    from audit_log
    where created_at >= now() - ${interval}
    order by created_at desc limit 100`);
  return {
    auditEvents: (r.rows as Array<{ id: string; actor_user_id: string | null; actor_name: string; action: string; target_type: string; target_id: string; metadata: Record<string, unknown> | null; created_at: Date | string }>).map(row => ({
      id: row.id,
      timestamp: new Date(row.created_at).toISOString(),
      user: row.actor_user_id ?? row.actor_name,
      action: row.action,
      target: row.target_id ? `${row.target_type}:${row.target_id}` : (row.target_type || "—"),
      details: row.metadata ? JSON.stringify(row.metadata).slice(0, 280) : "",
      correlationId: row.id,
      immutable: true,
    })),
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
export async function getAnalyticsTab<T extends AnalyticsTab>(
  db: Db,
  tab: T,
  filters: AnalyticsFiltersInput,
): Promise<AnalyticsTabPayloadMap[T]> {
  switch (tab) {
    case "executive": return await getExecutive(db, filters) as AnalyticsTabPayloadMap[T];
    case "fraud":     return await getFraud(db, filters) as AnalyticsTabPayloadMap[T];
    case "aml":       return await getAml(db, filters) as AnalyticsTabPayloadMap[T];
    case "models":    return await getModels(db, filters) as AnalyticsTabPayloadMap[T];
    case "rules":     return await getRules(db, filters) as AnalyticsTabPayloadMap[T];
    case "geography": return await getGeography(db, filters) as AnalyticsTabPayloadMap[T];
    case "channels":  return await getChannels(db, filters) as AnalyticsTabPayloadMap[T];
    case "users":     return await getUsers(db, filters) as AnalyticsTabPayloadMap[T];
    case "operations": return await getOperations(db, filters) as AnalyticsTabPayloadMap[T];
    case "audit":     return await getAudit(db, filters) as AnalyticsTabPayloadMap[T];
    default: throw new Error(`Unknown analytics tab: ${tab}`);
  }
}

export const ANALYTICS_TABS: AnalyticsTab[] = [
  "executive","fraud","aml","models","rules","geography","channels","users","operations","audit",
];
