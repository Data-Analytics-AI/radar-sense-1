import crypto from "node:crypto";

export type ProviderId =
  | "azure-openai"
  | "openai"
  | "deepseek"
  | "anthropic"
  | "gemini"
  | "bedrock";

export interface CredField {
  key: string;
  label: string;
  placeholder?: string;
  secret: boolean;
  help?: string;
  /** Server-side default applied when the operator leaves the field blank. */
  default?: string;
  /** When true, save/test will succeed without an explicit value (uses `default`). */
  optional?: boolean;
}

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  requiredCreds: CredField[];
  defaultModel: string;
  modelHelp: string;
}

export interface AnalyzeOpts {
  creds: Record<string, string>;
  model: string;
  systemPrompt: string;
  userContent: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface ChatOpts {
  creds: Record<string, string>;
  model: string;
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
}

export interface ValidateOpts {
  creds: Record<string, string>;
  model: string;
  timeoutMs: number;
}

export interface AIProvider extends ProviderMeta {
  analyze(opts: AnalyzeOpts): Promise<string>;
  /** Returns an async iterable of plain content tokens. */
  chatStream(opts: ChatOpts): Promise<AsyncIterable<string>>;
  validate(opts: ValidateOpts): Promise<{ ok: boolean; error?: string }>;
}

export const PROVIDER_META: Record<ProviderId, ProviderMeta> = {
  "azure-openai": {
    id: "azure-openai",
    label: "Azure OpenAI",
    defaultModel: "gpt-4o",
    modelHelp: "Deployment name on your Azure resource (used as the model identifier).",
    requiredCreds: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "Azure OpenAI API key", help: "Found in Azure Portal → your OpenAI resource → Keys and Endpoint." },
      { key: "endpoint", label: "Endpoint URL", secret: false, placeholder: "https://your-resource.openai.azure.com", help: "The base resource URL (no path). Example: https://acme-openai.openai.azure.com" },
      { key: "deployment", label: "Deployment Name", secret: false, placeholder: "gpt-4o", help: "The deployment you created under Azure OpenAI Studio — not the underlying model name." },
      { key: "apiVersion", label: "API Version", secret: false, placeholder: "2024-08-01-preview", help: "Azure OpenAI REST API version. Leave blank to use 2024-08-01-preview.", optional: true, default: "2024-08-01-preview" },
    ],
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    defaultModel: "gpt-4o-mini",
    modelHelp: "Any OpenAI chat model id, e.g. gpt-4o-mini, gpt-4o.",
    requiredCreds: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "sk-...", help: "Personal or org key from platform.openai.com/api-keys. Must have access to the chosen model." },
    ],
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    defaultModel: "deepseek-chat",
    modelHelp: "deepseek-chat or deepseek-reasoner. For Huawei ModelArts/Aliyun/Together-style hosts, use the model id from the host (e.g. DeepSeek-V3).",
    requiredCreds: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "DeepSeek or host API key", help: "From platform.deepseek.com or your hosted provider (Huawei ModelArts Studio, Aliyun, Together, OpenRouter, etc.). Sent as Bearer token to the OpenAI-compatible endpoint." },
      { key: "baseUrl", label: "Base URL", secret: false, placeholder: "https://api.deepseek.com/v1", help: "OpenAI-compatible chat-completions endpoint. Paste the FULL URL shown by your provider — including any '/chat/completions' suffix. We strip it and re-append it ourselves. Examples: official → https://api.deepseek.com/v1 ; Huawei ModelArts Studio (MaaS) → https://api.modelarts-maas.com/v1/chat/completions ; Huawei ModelArts real-time inference → https://infer-modelarts-cn-southwest-2.modelarts-infer.com/v1/infers/<INFER_ID>/v1/chat/completions", optional: true, default: "https://api.deepseek.com/v1" },
    ],
  },
  anthropic: {
    id: "anthropic",
    label: "Anthropic Claude",
    defaultModel: "claude-3-5-sonnet-20241022",
    modelHelp: "e.g. claude-3-5-sonnet-20241022, claude-3-5-haiku-20241022.",
    requiredCreds: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "sk-ant-...", help: "From console.anthropic.com → Settings → API Keys. Sent as the 'x-api-key' header." },
    ],
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    defaultModel: "gemini-1.5-pro",
    modelHelp: "e.g. gemini-1.5-pro, gemini-1.5-flash.",
    requiredCreds: [
      { key: "apiKey", label: "API Key", secret: true, placeholder: "Google AI Studio API key", help: "Created at aistudio.google.com → Get API key. Workspace API keys also work." },
    ],
  },
  bedrock: {
    id: "bedrock",
    label: "AWS Bedrock",
    defaultModel: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    modelHelp: "Bedrock model id, e.g. anthropic.claude-3-5-sonnet-20240620-v1:0.",
    requiredCreds: [
      { key: "accessKeyId", label: "AWS Access Key ID", secret: false, placeholder: "AKIA...", help: "IAM access key ID with bedrock:InvokeModel permission for the chosen model." },
      { key: "secretAccessKey", label: "AWS Secret Access Key", secret: true, placeholder: "Secret key", help: "IAM secret access key paired with the Access Key ID. Used to sign requests with SigV4." },
      { key: "region", label: "Region", secret: false, placeholder: "us-east-1", help: "AWS region where the Bedrock model is enabled, e.g. us-east-1, us-west-2, eu-central-1." },
    ],
  },
};

// ---------- helpers ----------

function abortSignal(timeoutMs: number): AbortSignal {
  return AbortSignal.timeout(timeoutMs);
}

async function safeJsonError(r: Response): Promise<string> {
  const target = `${r.status} at ${r.url}`;
  try {
    const text = await r.text();
    if (!text) return `HTTP ${target}`;
    try {
      const data = JSON.parse(text) as { error?: { message?: string } | string; message?: string; error_msg?: string };
      if (typeof data?.error === "string") return `HTTP ${target} — ${data.error}`;
      if (data?.error && typeof data.error === "object" && "message" in data.error) {
        return `HTTP ${target} — ${String(data.error.message)}`;
      }
      if (typeof data?.message === "string") return `HTTP ${target} — ${data.message}`;
      if (typeof data?.error_msg === "string") return `HTTP ${target} — ${data.error_msg}`;
    } catch { /* not JSON */ }
    const snippet = text.slice(0, 200).replace(/\s+/g, " ").trim();
    return snippet ? `HTTP ${target} — ${snippet}` : `HTTP ${target}`;
  } catch {
    return `HTTP ${target}`;
  }
}

function* singleTokenStream(text: string): Iterable<string> {
  if (text) yield text;
}

async function* asAsyncIterable<T>(it: Iterable<T>): AsyncIterable<T> {
  for (const x of it) yield x;
}

// ---------- OpenAI-compatible base (OpenAI, DeepSeek) ----------

interface OpenAICompatConfig {
  baseUrl: string; // e.g. https://api.openai.com/v1
  apiKey: string;
}

async function openaiCompatAnalyze(cfg: OpenAICompatConfig, opts: AnalyzeOpts): Promise<string> {
  const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        { role: "system", content: opts.systemPrompt },
        { role: "user", content: opts.userContent },
      ],
    }),
    signal: abortSignal(opts.timeoutMs),
  });
  if (!r.ok) throw new Error(await safeJsonError(r));
  const json = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

async function openaiCompatChatStream(cfg: OpenAICompatConfig, opts: ChatOpts): Promise<AsyncIterable<string>> {
  const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      stream: true,
      messages: [
        { role: "system", content: opts.systemPrompt },
        ...opts.messages,
      ],
    }),
    signal: abortSignal(opts.timeoutMs),
  });
  if (!r.ok || !r.body) throw new Error(await safeJsonError(r));
  return parseOpenAISSE(r.body);
}

async function* parseOpenAISSE(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data);
        const content = parsed?.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content) yield content;
      } catch { /* ignore */ }
    }
  }
}

async function openaiCompatValidate(cfg: OpenAICompatConfig, opts: ValidateOpts): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
      signal: abortSignal(opts.timeoutMs),
    });
    if (r.ok) return { ok: true };
    return { ok: false, error: await safeJsonError(r) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- Azure OpenAI ----------

function azureUrl(creds: Record<string, string>, model: string): string {
  const endpoint = (creds.endpoint || "").replace(/\/$/, "");
  const deployment = creds.deployment || model;
  const apiVersion = creds.apiVersion || "2024-08-01-preview";
  return `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
}

const azureProvider: AIProvider = {
  ...PROVIDER_META["azure-openai"],
  async analyze(opts) {
    const r = await fetch(azureUrl(opts.creds, opts.model), {
      method: "POST",
      headers: { "api-key": opts.creds.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        messages: [
          { role: "system", content: opts.systemPrompt },
          { role: "user", content: opts.userContent },
        ],
      }),
      signal: abortSignal(opts.timeoutMs),
    });
    if (!r.ok) throw new Error(await safeJsonError(r));
    const json = await r.json() as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? "";
  },
  async chatStream(opts) {
    const r = await fetch(azureUrl(opts.creds, opts.model), {
      method: "POST",
      headers: { "api-key": opts.creds.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        stream: true,
        messages: [
          { role: "system", content: opts.systemPrompt },
          ...opts.messages,
        ],
      }),
      signal: abortSignal(opts.timeoutMs),
    });
    if (!r.ok || !r.body) throw new Error(await safeJsonError(r));
    return parseOpenAISSE(r.body);
  },
  async validate(opts) {
    try {
      const r = await fetch(azureUrl(opts.creds, opts.model), {
        method: "POST",
        headers: { "api-key": opts.creds.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
        signal: abortSignal(opts.timeoutMs),
      });
      if (r.ok) return { ok: true };
      return { ok: false, error: await safeJsonError(r) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ---------- OpenAI ----------

const openaiProvider: AIProvider = {
  ...PROVIDER_META.openai,
  analyze: (o) => openaiCompatAnalyze({ baseUrl: "https://api.openai.com/v1", apiKey: o.creds.apiKey }, o),
  chatStream: (o) => openaiCompatChatStream({ baseUrl: "https://api.openai.com/v1", apiKey: o.creds.apiKey }, o),
  validate: (o) => openaiCompatValidate({ baseUrl: "https://api.openai.com/v1", apiKey: o.creds.apiKey }, o),
};

// ---------- DeepSeek (OpenAI-compatible) ----------

function deepseekBase(creds: Record<string, string>): string {
  const raw = (creds.baseUrl || "").trim() || "https://api.deepseek.com/v1";
  // Tolerate trailing slashes, query strings, and accidental /chat/completions
  // (or /completions) suffixes that hosts like Huawei ModelArts Studio show
  // in their console. We always re-append /chat/completions ourselves.
  let url = raw.split("?")[0].replace(/\/+$/, "");
  url = url.replace(/\/(chat\/)?completions$/i, "");
  return url;
}

const deepseekProvider: AIProvider = {
  ...PROVIDER_META.deepseek,
  analyze: (o) => openaiCompatAnalyze({ baseUrl: deepseekBase(o.creds), apiKey: o.creds.apiKey }, o),
  chatStream: (o) => openaiCompatChatStream({ baseUrl: deepseekBase(o.creds), apiKey: o.creds.apiKey }, o),
  validate: (o) => openaiCompatValidate({ baseUrl: deepseekBase(o.creds), apiKey: o.creds.apiKey }, o),
};

// ---------- Anthropic ----------

async function anthropicCall(creds: Record<string, string>, body: unknown, timeoutMs: number): Promise<Response> {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": creds.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: abortSignal(timeoutMs),
  });
}

const anthropicProvider: AIProvider = {
  ...PROVIDER_META.anthropic,
  async analyze(opts) {
    const r = await anthropicCall(opts.creds, {
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.systemPrompt,
      messages: [{ role: "user", content: opts.userContent }],
    }, opts.timeoutMs);
    if (!r.ok) throw new Error(await safeJsonError(r));
    const json = await r.json() as { content?: Array<{ type: string; text?: string }> };
    return (json.content || []).map(b => b.type === "text" ? (b.text || "") : "").join("");
  },
  async chatStream(opts) {
    // Use non-streaming and emit as a single token (keeps client-side parser simple).
    const r = await anthropicCall(opts.creds, {
      model: opts.model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.systemPrompt,
      messages: opts.messages,
    }, opts.timeoutMs);
    if (!r.ok) throw new Error(await safeJsonError(r));
    const json = await r.json() as { content?: Array<{ type: string; text?: string }> };
    const text = (json.content || []).map(b => b.type === "text" ? (b.text || "") : "").join("");
    return asAsyncIterable(singleTokenStream(text));
  },
  async validate(opts) {
    try {
      const r = await anthropicCall(opts.creds, {
        model: opts.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }, opts.timeoutMs);
      if (r.ok) return { ok: true };
      return { ok: false, error: await safeJsonError(r) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ---------- Google Gemini ----------

function geminiUrl(model: string, apiKey: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

function geminiBody(opts: { systemPrompt: string; messages: { role: string; content: string }[]; temperature: number; maxTokens: number }) {
  return {
    systemInstruction: { parts: [{ text: opts.systemPrompt }] },
    contents: opts.messages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: opts.temperature,
      maxOutputTokens: opts.maxTokens,
    },
  };
}

const geminiProvider: AIProvider = {
  ...PROVIDER_META.gemini,
  async analyze(opts) {
    const r = await fetch(geminiUrl(opts.model, opts.creds.apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody({
        systemPrompt: opts.systemPrompt,
        messages: [{ role: "user", content: opts.userContent }],
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
      })),
      signal: abortSignal(opts.timeoutMs),
    });
    if (!r.ok) throw new Error(await safeJsonError(r));
    const json = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const parts = json.candidates?.[0]?.content?.parts || [];
    return parts.map(p => p.text || "").join("");
  },
  async chatStream(opts) {
    const r = await fetch(geminiUrl(opts.model, opts.creds.apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody(opts)),
      signal: abortSignal(opts.timeoutMs),
    });
    if (!r.ok) throw new Error(await safeJsonError(r));
    const json = await r.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = (json.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
    return asAsyncIterable(singleTokenStream(text));
  },
  async validate(opts) {
    try {
      const r = await fetch(geminiUrl(opts.model, opts.creds.apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody({
          systemPrompt: "ping",
          messages: [{ role: "user", content: "ping" }],
          temperature: 0,
          maxTokens: 1,
        })),
        signal: abortSignal(opts.timeoutMs),
      });
      if (r.ok) return { ok: true };
      return { ok: false, error: await safeJsonError(r) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ---------- AWS Bedrock (SigV4) ----------

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
function hmac(key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sigV4Headers(args: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
  host: string;
  path: string;
  body: string;
}): Record<string, string> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(args.body);

  const canonicalHeaders =
    `content-type:application/json\nhost:${args.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = ["POST", args.path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${args.region}/${args.service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");

  const kDate = hmac("AWS4" + args.secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, args.region);
  const kService = hmac(kRegion, args.service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${args.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    "Content-Type": "application/json",
    "Host": args.host,
    "X-Amz-Date": amzDate,
    "X-Amz-Content-Sha256": payloadHash,
    "Authorization": authorization,
  };
}

async function bedrockInvoke(creds: Record<string, string>, model: string, body: unknown, timeoutMs: number): Promise<Response> {
  const region = creds.region || "us-east-1";
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const path = `/model/${encodeURIComponent(model)}/invoke`;
  const bodyStr = JSON.stringify(body);
  const headers = sigV4Headers({
    accessKeyId: creds.accessKeyId,
    secretAccessKey: creds.secretAccessKey,
    region,
    service: "bedrock",
    host,
    path,
    body: bodyStr,
  });
  return fetch(`https://${host}${path}`, {
    method: "POST",
    headers,
    body: bodyStr,
    signal: abortSignal(timeoutMs),
  });
}

function bedrockPayload(model: string, opts: { systemPrompt: string; messages: { role: string; content: string }[]; temperature: number; maxTokens: number }) {
  // Default to Anthropic-on-Bedrock payload shape (most common). Mistral/Cohere/Titan would need branching.
  if (model.startsWith("anthropic.")) {
    return {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system: opts.systemPrompt,
      messages: opts.messages.length
        ? opts.messages
        : [{ role: "user", content: "ping" }],
    };
  }
  // Fallback: send a generic prompt-style body (Titan).
  const merged = `${opts.systemPrompt}\n\n` + opts.messages.map(m => `${m.role}: ${m.content}`).join("\n");
  return {
    inputText: merged,
    textGenerationConfig: { temperature: opts.temperature, maxTokenCount: opts.maxTokens },
  };
}

interface BedrockAnthropicBlock { type?: string; text?: string }
interface BedrockResponseShape {
  content?: BedrockAnthropicBlock[];
  results?: { outputText?: string }[];
  outputText?: string;
}
function extractBedrockText(model: string, json: unknown): string {
  const j = (json ?? {}) as BedrockResponseShape;
  if (model.startsWith("anthropic.")) {
    return (j.content ?? [])
      .map((b) => (b?.type === "text" ? b.text ?? "" : ""))
      .join("");
  }
  return j.results?.[0]?.outputText ?? j.outputText ?? "";
}

const bedrockProvider: AIProvider = {
  ...PROVIDER_META.bedrock,
  async analyze(opts) {
    const body = bedrockPayload(opts.model, {
      systemPrompt: opts.systemPrompt,
      messages: [{ role: "user", content: opts.userContent }],
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
    const r = await bedrockInvoke(opts.creds, opts.model, body, opts.timeoutMs);
    if (!r.ok) throw new Error(await safeJsonError(r));
    const json = await r.json();
    return extractBedrockText(opts.model, json);
  },
  async chatStream(opts) {
    const body = bedrockPayload(opts.model, opts);
    const r = await bedrockInvoke(opts.creds, opts.model, body, opts.timeoutMs);
    if (!r.ok) throw new Error(await safeJsonError(r));
    const json = await r.json();
    return asAsyncIterable(singleTokenStream(extractBedrockText(opts.model, json)));
  },
  async validate(opts) {
    try {
      const body = bedrockPayload(opts.model, {
        systemPrompt: "ping",
        messages: [{ role: "user", content: "ping" }],
        temperature: 0,
        maxTokens: 1,
      });
      const r = await bedrockInvoke(opts.creds, opts.model, body, opts.timeoutMs);
      if (r.ok) return { ok: true };
      return { ok: false, error: await safeJsonError(r) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};

// ---------- registry ----------

export const PROVIDERS: Record<ProviderId, AIProvider> = {
  "azure-openai": azureProvider,
  openai: openaiProvider,
  deepseek: deepseekProvider,
  anthropic: anthropicProvider,
  gemini: geminiProvider,
  bedrock: bedrockProvider,
};

export function isProviderId(x: unknown): x is ProviderId {
  return typeof x === "string" && x in PROVIDERS;
}

export function maskSecret(value: string | undefined): string {
  if (!value) return "";
  if (value.length <= 6) return "•".repeat(value.length);
  return `${value.slice(0, 3)}${"•".repeat(Math.max(4, value.length - 7))}${value.slice(-4)}`;
}

export function maskCreds(provider: ProviderId, creds: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of PROVIDER_META[provider].requiredCreds) {
    const v = creds[f.key] || "";
    out[f.key] = maskSecret(v);
  }
  return out;
}
