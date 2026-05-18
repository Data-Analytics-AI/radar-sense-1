import express from "express";
import cors from "cors";
import { z } from "zod";
import path from "path";
import {
  PROVIDERS, PROVIDER_META, maskCreds,
  type ProviderId, type AIProvider,
} from "./ai-providers.js";
import { registerDataRoutes } from "./routes.js";
import { isDbConfigured, pingDb } from "./db.js";
import { isObsConfigured, pingObs } from "./obs.js";
import { seedDatabaseIfEmpty, ensureSchemaPatches } from "./seed.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "256kb" }));

const SYSTEM_PROMPT = `You are SnapFort, an advanced fraud detection and AML investigation assistant for financial services institutions.

Your capabilities include:
- Analyzing transaction patterns and identifying suspicious activities
- Explaining why transactions were flagged as high-risk
- Providing insights on fraud detection rules and AML compliance
- Assisting with case investigations and SAR narrative drafting
- Answering questions about risk scores, alerts, and detection models

Always provide clear, concise, and actionable insights. When discussing specific cases or transactions, explain the risk factors in a way that compliance officers and fraud analysts can understand.

Format your responses with markdown for better readability. Use bullet points for lists and bold text for important terms.`;

type AnalyzeKind = "kyc_summary" | "fraud_explain" | "str_draft" | "risk_reasoning" | "customer_intel";

const ANALYZE_PROMPTS: Record<AnalyzeKind, string> = {
  kyc_summary:
    "You are a KYC analyst. Summarize the customer's KYC profile, highlight document completeness, identify any red flags, and provide a confidence assessment in 200 words. Use markdown bullet sections.",
  fraud_explain:
    "You are a fraud investigator. Given the alert/transaction context, explain in plain English why it triggered, list contributing factors, and recommend next investigative steps. Use concise markdown with bullet sections.",
  str_draft:
    "You are a financial crime compliance officer drafting a Suspicious Transaction Report narrative for the NFIU. Use formal regulatory language. Include: (1) Subject identification, (2) Transactions of concern with amounts and dates, (3) Reasons for suspicion, (4) Supporting evidence, (5) Recommended action. Format ready to paste into an STR.",
  risk_reasoning:
    "You are a risk analyst. Given the customer's risk-score breakdown, explain in clear English which factors most contributed to the score, what they mean, and what mitigations could reduce it. Use concise markdown.",
  customer_intel:
    "You are a senior customer-intelligence analyst at a Nigerian bank. Given the customer's 360° profile (KYC, risk score, recent transactions, screening matches, cases, EDD status), produce EXACTLY four bullets explaining why risk changed / where it stands. Format as markdown bullets in this exact order and labels:\n- **Risk verdict:** <headline verdict + score>\n- **Top driver:** <single biggest factor with evidence>\n- **Behavioral delta:** <anomaly vs expected profile>\n- **Recommended next action:** <one concrete analyst step>\nNo preamble, no extra bullets, no closing paragraph. Keep each bullet under 30 words.",
};

function deterministicCustomerIntel(ctx: unknown): string {
  try {
    const c = ctx as Record<string, unknown>;
    const name = String(c.name ?? c.id ?? "Customer");
    const score = Number(c.riskScore ?? 50);
    const verdict = score >= 75 ? "HIGH RISK" : score >= 50 ? "ELEVATED" : score >= 25 ? "MODERATE" : "LOW";
    const concerns = Array.isArray(c.concerns) ? (c.concerns as string[]) : [];
    const txnCount = Number(c.recentTxnCount ?? 0);
    const screening = Number(c.screeningHits ?? 0);
    const cases = Number(c.openCases ?? 0);
    const expected = Number(c.expectedAnnualVolume ?? 0);
    const actual = Number(c.actualVolume ?? 0);
    const ratio = expected > 0 ? actual / expected : 1;
    const topDriver = concerns[0] ?? (screening > 0 ? `${screening} active screening match(es)` : `${txnCount} recent transactions, ${cases} open case(s)`);
    const delta = ratio > 1.5 ? `Activity is ${(ratio * 100 - 100).toFixed(0)}% above expected profile`
      : ratio < 0.5 ? `Activity is ${(100 - ratio * 100).toFixed(0)}% below expected profile`
      : `Activity tracks within expected band (${(ratio * 100).toFixed(0)}% of expected)`;
    const next = score >= 75 ? "Escalate to senior compliance and queue STR draft"
      : score >= 50 ? "Open EDD review and request enhanced documentation"
      : "Maintain routine monitoring and re-screen in 30 days";
    return [
      `- **Risk verdict:** ${verdict} (score ${score}/100 for ${name})`,
      `- **Top driver:** ${topDriver}`,
      `- **Behavioral delta:** ${delta}`,
      `- **Recommended next action:** ${next}`,
    ].join('\n');
  } catch {
    return [
      `- **Risk verdict:** Unable to compute — context unavailable`,
      `- **Top driver:** N/A`,
      `- **Behavioral delta:** N/A`,
      `- **Recommended next action:** Refresh customer profile data and retry`,
    ].join('\n');
  }
}


const MAX_CONTEXT_BYTES = 64 * 1024;
const VALIDATE_TIMEOUT_MS = 8_000;
const ANALYZE_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 60_000;

// ---------- active config (in-memory) ----------

interface ActiveConfig {
  providerId: ProviderId;
  model: string;
  temperature: number;
  maxTokens: number;
  promptVersion: string;
  creds: Record<string, string>;
  isCustom: boolean; // true if user-saved, false if env-default
}

function envDefaultConfig(): ActiveConfig | null {
  const azureKey = process.env.AZURE_OPENAI_API_KEY;
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const azureDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  if (azureKey && azureEndpoint && azureDeployment) {
    return {
      providerId: "azure-openai",
      model: azureDeployment,
      temperature: 0.3,
      maxTokens: 4096,
      promptVersion: "v2.4",
      creds: {
        apiKey: azureKey,
        endpoint: azureEndpoint,
        deployment: azureDeployment,
        apiVersion: "2024-08-01-preview",
      },
      isCustom: false,
    };
  }
  return null;
}

// Per task spec the default fallback provider is Azure OpenAI. If the
// AZURE_OPENAI_* env vars are missing we fail closed (no default) and
// the operator must configure a provider via Settings.
let DEFAULT_CONFIG: ActiveConfig | null = envDefaultConfig();
let activeConfig: ActiveConfig | null = DEFAULT_CONFIG;
if (DEFAULT_CONFIG) {
  console.log(
    `[ai] Default fallback provider: ${PROVIDER_META[DEFAULT_CONFIG.providerId].label} (${DEFAULT_CONFIG.model})`,
  );
} else {
  console.warn("[ai] No default AI provider configured. Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, and AZURE_OPENAI_DEPLOYMENT to enable the Azure OpenAI default fallback.");
}

function publicConfig(cfg: ActiveConfig | null) {
  if (!cfg) return null;
  return {
    providerId: cfg.providerId,
    providerLabel: PROVIDER_META[cfg.providerId].label,
    model: cfg.model,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    promptVersion: cfg.promptVersion,
    isCustom: cfg.isCustom,
    credsMasked: maskCreds(cfg.providerId, cfg.creds),
  };
}

// ---------- request validation (zod) ----------

const ProviderIdSchema = z.enum([
  "azure-openai", "openai", "deepseek", "anthropic", "gemini", "bedrock",
] as const);

const SaveConfigSchema = z.object({
  providerId: ProviderIdSchema,
  model: z.string().trim().max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(16).max(32_000).optional(),
  promptVersion: z.string().max(64).optional(),
  creds: z.record(z.string(), z.string()).optional(),
});

const AnalyzeRequestSchema = z.object({
  kind: z.enum(["kyc_summary", "fraud_explain", "str_draft", "risk_reasoning", "customer_intel"] as const),
  context: z.unknown(),
});

const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"] as const),
  content: z.string(),
});
const ChatRequestSchema = z.object({
  messages: z.array(ChatMessageSchema.passthrough()),
});

function firstZodError(err: z.ZodError): string {
  const issue = err.issues[0];
  return issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid request.";
}

function parseConfigInput(body: unknown): { cfg?: Omit<ActiveConfig, "isCustom">; error?: string } {
  const parsed = SaveConfigSchema.safeParse(body);
  if (!parsed.success) return { error: firstZodError(parsed.error) };
  const { providerId } = parsed.data;
  const model = (parsed.data.model && parsed.data.model.length > 0)
    ? parsed.data.model
    : PROVIDER_META[providerId].defaultModel;
  const temperature = parsed.data.temperature ?? 0.3;
  const maxTokens = parsed.data.maxTokens ?? 4096;
  const promptVersion = parsed.data.promptVersion ?? "v2.4";
  const credsObj = parsed.data.creds ?? {};
  // Reuse stored creds when the user submits an empty creds object for the
  // currently-active or environment-default provider (so admins can tweak
  // model/temperature without re-pasting secrets).
  const submittedAny = Object.values(credsObj).some(v => v.trim().length > 0);
  let fallbackCreds: Record<string, string> | null = null;
  if (!submittedAny) {
    if (activeConfig && activeConfig.providerId === providerId) fallbackCreds = activeConfig.creds;
    else if (DEFAULT_CONFIG && DEFAULT_CONFIG.providerId === providerId) fallbackCreds = DEFAULT_CONFIG.creds;
  }
  const creds: Record<string, string> = {};
  for (const f of PROVIDER_META[providerId].requiredCreds) {
    const raw = credsObj[f.key];
    if (typeof raw === "string" && raw.trim()) {
      creds[f.key] = raw.trim();
      continue;
    }
    if (fallbackCreds && typeof fallbackCreds[f.key] === "string") {
      creds[f.key] = fallbackCreds[f.key];
      continue;
    }
    if (f.optional && typeof f.default === "string") {
      creds[f.key] = f.default;
      continue;
    }
    return { error: `Missing credential: ${f.label}` };
  }
  return { cfg: { providerId, model, temperature, maxTokens, promptVersion, creds } };
}

function redactError(msg: string, creds: Record<string, string>, providerId?: ProviderId): string {
  let out = msg;
  // Only scrub SECRET credential values from error strings — keep
  // non-secret fields (endpoint URLs, region, deployment names) visible
  // so operators can debug 4xx/5xx responses from upstream providers.
  const meta = providerId ? PROVIDER_META[providerId] : null;
  const secretKeys = new Set(
    (meta?.requiredCreds || []).filter(f => f.secret).map(f => f.key),
  );
  for (const [k, v] of Object.entries(creds)) {
    if (meta && !secretKeys.has(k)) continue;
    if (v && v.length > 4) out = out.split(v).join("•".repeat(8));
  }
  return out;
}

// ---------- config endpoints ----------

app.get("/api/ai/config", (_req, res) => {
  res.json({
    active: publicConfig(activeConfig),
    default: publicConfig(DEFAULT_CONFIG),
    providers: Object.values(PROVIDER_META).map(p => ({
      id: p.id,
      label: p.label,
      defaultModel: p.defaultModel,
      modelHelp: p.modelHelp,
      requiredCreds: p.requiredCreds,
    })),
  });
});

app.post("/api/ai/config/test", async (req, res) => {
  const parsed = parseConfigInput(req.body || {});
  if (parsed.error || !parsed.cfg) return res.status(400).json({ ok: false, error: parsed.error });
  const provider = PROVIDERS[parsed.cfg.providerId];
  try {
    const result = await provider.validate({
      creds: parsed.cfg.creds,
      model: parsed.cfg.model,
      timeoutMs: VALIDATE_TIMEOUT_MS,
    });
    if (result.ok) return res.json({ ok: true });
    return res.json({ ok: false, error: redactError(result.error || "Validation failed", parsed.cfg.creds, parsed.cfg.providerId) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.json({ ok: false, error: redactError(msg, parsed.cfg.creds, parsed.cfg.providerId) });
  }
});

app.post("/api/ai/config", async (req, res) => {
  const parsed = parseConfigInput(req.body || {});
  if (parsed.error || !parsed.cfg) return res.status(400).json({ error: parsed.error });
  const provider = PROVIDERS[parsed.cfg.providerId];
  try {
    const v = await provider.validate({
      creds: parsed.cfg.creds,
      model: parsed.cfg.model,
      timeoutMs: VALIDATE_TIMEOUT_MS,
    });
    if (!v.ok) {
      return res.status(400).json({ error: redactError(v.error || "Validation failed", parsed.cfg.creds, parsed.cfg.providerId) });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return res.status(400).json({ error: redactError(msg, parsed.cfg.creds, parsed.cfg.providerId) });
  }
  activeConfig = { ...parsed.cfg, isCustom: true };
  res.json({ ok: true, active: publicConfig(activeConfig) });
});

app.post("/api/ai/config/reset", (_req, res) => {
  activeConfig = DEFAULT_CONFIG;
  res.json({ ok: true, active: publicConfig(activeConfig) });
});

// ---------- analyze ----------

async function runAnalyze(provider: AIProvider, cfg: ActiveConfig, kind: AnalyzeKind, serializedContext: string): Promise<string> {
  const systemPrompt = ANALYZE_PROMPTS[kind];
  const userContent = "Context (JSON):\n```json\n" + serializedContext + "\n```";
  return provider.analyze({
    creds: cfg.creds,
    model: cfg.model,
    systemPrompt,
    userContent,
    temperature: cfg.temperature,
    maxTokens: cfg.maxTokens,
    timeoutMs: ANALYZE_TIMEOUT_MS,
  });
}

app.post("/api/ai/analyze", async (req, res) => {
  try {
    const parsedReq = AnalyzeRequestSchema.safeParse(req.body);
    if (!parsedReq.success) {
      return res.status(400).json({ error: firstZodError(parsedReq.error) });
    }
    const { kind, context } = parsedReq.data;
    const serializedContext = JSON.stringify(context ?? {});
    if (Buffer.byteLength(serializedContext, "utf8") > MAX_CONTEXT_BYTES) {
      return res.status(413).json({ error: `'context' exceeds ${MAX_CONTEXT_BYTES} bytes.` });
    }

    if (!activeConfig && !DEFAULT_CONFIG) {
      if (kind === "customer_intel") {
        return res.json({ result: deterministicCustomerIntel(context), fallbackUsed: true, providerId: null, providerLabel: "Deterministic" });
      }
      return res.status(500).json({ error: "No AI provider configured. Set Azure OpenAI or OpenAI API keys, or save a custom provider in Settings." });
    }

    const tries: { cfg: ActiveConfig; isFallback: boolean }[] = [];
    if (activeConfig) tries.push({ cfg: activeConfig, isFallback: false });
    if (DEFAULT_CONFIG && DEFAULT_CONFIG !== activeConfig) {
      tries.push({ cfg: DEFAULT_CONFIG, isFallback: true });
    }

    let lastError = "";
    let fallbackUsed = false;
    for (const t of tries) {
      try {
        const provider = PROVIDERS[t.cfg.providerId];
        const result = await runAnalyze(provider, t.cfg, kind, serializedContext);
        if (t.isFallback) fallbackUsed = true;
        return res.json({ result, fallbackUsed, providerId: t.cfg.providerId, providerLabel: PROVIDER_META[t.cfg.providerId].label });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastError = redactError(`${t.cfg.providerId} failed: ${msg}`, t.cfg.creds, t.cfg.providerId);
        console.warn(lastError);
      }
    }
    if (kind === "customer_intel") {
      return res.json({ result: deterministicCustomerIntel(context), fallbackUsed: true, providerId: null, providerLabel: "Deterministic" });
    }
    return res.status(500).json({ error: lastError || "AI service temporarily unavailable." });
  } catch (error) {
    console.error("Analyze error:", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
  }
});

// ---------- chat (SSE) ----------

function writeSSEDelta(res: express.Response, content: string) {
  res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
}
function writeSSEMeta(res: express.Response, meta: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify({ meta })}\n\n`);
}
function writeSSEDone(res: express.Response) {
  res.write(`data: [DONE]\n\n`);
  res.end();
}

app.post("/api/chat", async (req, res) => {
  try {
    const parsedReq = ChatRequestSchema.safeParse(req.body);
    if (!parsedReq.success) {
      return res.status(400).json({ error: firstZodError(parsedReq.error) });
    }
    const cleanMessages: { role: "user" | "assistant"; content: string }[] =
      parsedReq.data.messages.map((m) => ({ role: m.role, content: m.content }));

    if (!activeConfig && !DEFAULT_CONFIG) {
      return res.status(500).json({ error: "No AI provider configured." });
    }

    const tries: { cfg: ActiveConfig; isFallback: boolean }[] = [];
    if (activeConfig) tries.push({ cfg: activeConfig, isFallback: false });
    if (DEFAULT_CONFIG && DEFAULT_CONFIG !== activeConfig) {
      tries.push({ cfg: DEFAULT_CONFIG, isFallback: true });
    }

    let stream: AsyncIterable<string> | null = null;
    let usedFallback = false;
    let lastError = "";
    let usedProvider: ProviderId | null = null;
    for (const t of tries) {
      try {
        const provider = PROVIDERS[t.cfg.providerId];
        stream = await provider.chatStream({
          creds: t.cfg.creds,
          model: t.cfg.model,
          systemPrompt: SYSTEM_PROMPT,
          messages: cleanMessages,
          temperature: t.cfg.temperature,
          maxTokens: t.cfg.maxTokens,
          timeoutMs: CHAT_TIMEOUT_MS,
        });
        usedFallback = t.isFallback;
        usedProvider = t.cfg.providerId;
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        lastError = redactError(`${t.cfg.providerId} failed: ${msg}`, t.cfg.creds, t.cfg.providerId);
        console.warn(lastError);
      }
    }

    if (!stream) {
      return res.status(500).json({ error: lastError || "AI service temporarily unavailable." });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    writeSSEMeta(res, { fallbackUsed: usedFallback, providerId: usedProvider, providerLabel: usedProvider ? PROVIDER_META[usedProvider as ProviderId].label : undefined });

    try {
      for await (const chunk of stream) {
        if (chunk) writeSSEDelta(res, chunk);
      }
    } catch (e) {
      console.error("Stream error:", e);
    } finally {
      writeSSEDone(res);
    }
  } catch (error) {
    console.error("Chat error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Unknown error" });
    } else {
      res.end();
    }
  }
});

// ---------- health ----------

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "snapfort", uptime: process.uptime(), ts: new Date().toISOString() });
});

// ---------- data routes (Huawei RDS / Drizzle) ----------
registerDataRoutes(app);

// ---------- static (prod) ----------

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  const distPath = path.resolve(process.cwd(), "dist", "public");
  app.use("/assets", express.static(path.join(distPath, "assets"), { maxAge: "30d", immutable: true }));
  app.use(express.static(distPath, { maxAge: 0 }));
  app.get("/{*splat}", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.sendFile(path.join(distPath, "index.html"));
  });
}



async function initDb(): Promise<void> {
  if (!isDbConfigured()) {
    console.warn("[db] HUAWEI_PG* env vars not set — /api/customers and friends will return 503.");
    return;
  }
  const ping = await pingDb();
  if (!ping.ok) {
    console.error(`[db] Connection failed (${ping.latencyMs}ms): ${ping.error}`);
    return;
  }
  console.log(`[db] Connected (${ping.latencyMs}ms): ${ping.version?.split(" ").slice(0, 2).join(" ")}`);
  try {
    await ensureSchemaPatches();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[db] schema patch failed:", msg);
  }
  try {
    await seedDatabaseIfEmpty();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[seed] Seeding failed (continuing without seed):", msg);
  }
}

const PORT = Number(process.env.PORT) || (isProduction ? 5000 : 3001);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API server running on port ${PORT}`);
  initDb().catch((e) => console.error("[db] init error:", e));
  initObs().catch((e) => console.error("[obs] init error:", e));
});

async function initObs(): Promise<void> {
  // Touch the store once so MemoryObjectStore logs its WARN at boot, not on
  // first request. Then run the round-trip health probe.
  const { getObjectStore } = await import("./object-store.js");
  const store = getObjectStore();
  if (!isObsConfigured()) {
    console.warn(
      `[obs] HUAWEI_OBS_* env vars not set — using ${store.backend} backend. /api/system/obs-health will report this.`,
    );
    return;
  }
  const r = await pingObs();
  if (!r.ok) {
    console.error(`[obs] Round-trip failed (${r.latencyMs}ms) bucket=${r.bucket}: ${r.error}`);
    return;
  }
  console.log(
    `[obs] Connected (round-trip ${r.latencyMs}ms; put=${r.steps?.put}ms sign=${r.steps?.sign}ms fetch=${r.steps?.fetch}ms delete=${r.steps?.delete}ms): bucket=${r.bucket} endpoint=${r.endpoint}${r.region ? ` region=${r.region}` : ""}`,
  );
}
