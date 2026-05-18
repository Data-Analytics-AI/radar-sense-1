// Object storage abstraction. Two backends:
//   - HuaweiObjectStore: real Huawei Cloud OBS (production / staging)
//   - MemoryObjectStore: in-process map (dev/CI fallback so the server still
//     boots without HUAWEI_OBS_* secrets — logged loudly at boot)
//
// Consumers (routes, future feature code) MUST go through IObjectStore so we
// can swap backends without touching call sites. Credentials never leave
// process.env -> SDK client; the browser only ever receives short-lived
// presigned URLs from /api/uploads/sign.

import { createRequire } from "module";
import { randomUUID } from "crypto";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ObjectNamespace =
  | "customer-documents"
  | "case-evidence"
  | "reports"
  | "ai-chats"
  | "system-health"; // reserved for round-trip health probes

export const ALLOWED_NAMESPACES: readonly ObjectNamespace[] = [
  "customer-documents",
  "case-evidence",
  "reports",
  "ai-chats",
  "system-health",
];

// 25 MB hard cap on signed uploads. Enough for KYC scans / PDFs / evidence
// images while keeping per-request memory bounded.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface SignedUrlOptions {
  /** Seconds until the presigned URL expires. Defaults to 5 minutes. */
  expiresInSeconds?: number;
  /** Required Content-Type the client MUST send when PUTing. */
  contentType?: string;
}

export interface PutObjectInput {
  key: string;
  body: Buffer | string;
  contentType?: string;
}

export interface ObjectMetadata {
  key: string;
  sizeBytes?: number;
  contentType?: string;
  lastModified?: string;
}

export interface IObjectStore {
  readonly backend: "huawei" | "memory";
  readonly bucket: string;
  readonly endpoint: string;
  readonly region?: string;

  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  headObject(key: string): Promise<ObjectMetadata | null>;
  getSignedUploadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
  getSignedDownloadUrl(key: string, opts?: SignedUrlOptions): Promise<string>;
}

// ---------------------------------------------------------------------------
// Huawei OBS backend
// ---------------------------------------------------------------------------

interface ObsResponse<T = unknown> {
  CommonMsg: { Status: number; Code?: string; Message?: string };
  InterfaceResult?: T;
}
interface ObsClientLike {
  getBucketMetadata(p: { Bucket: string }): Promise<ObsResponse<Record<string, unknown>>>;
  putObject(p: { Bucket: string; Key: string; Body: Buffer | string; ContentType?: string }): Promise<ObsResponse<Record<string, unknown>>>;
  getObject(p: { Bucket: string; Key: string }): Promise<ObsResponse<{ Content?: Buffer; ContentLength?: number; ContentType?: string; LastModified?: string }>>;
  deleteObject(p: { Bucket: string; Key: string }): Promise<ObsResponse<Record<string, unknown>>>;
  getObjectMetadata(p: { Bucket: string; Key: string }): Promise<ObsResponse<Record<string, unknown>>>;
  createSignedUrlSync(p: { Method: "PUT" | "GET" | "DELETE" | "HEAD"; Bucket: string; Key: string; Expires?: number; Headers?: Record<string, string> }): { SignedUrl: string; ActualSignedRequestHeaders?: Record<string, string> };
  close(): void;
}
type ObsCtor = new (opts: { access_key_id: string; secret_access_key: string; server: string; timeout?: number }) => ObsClientLike;

function obsConfigured(): boolean {
  return Boolean(
    process.env.HUAWEI_OBS_AK &&
      process.env.HUAWEI_OBS_SK &&
      process.env.HUAWEI_OBS_ENDPOINT &&
      process.env.HUAWEI_OBS_BUCKET,
  );
}

function normalizeEndpoint(raw: string): string {
  const ep = raw.trim();
  if (!ep) return "";
  return ep.startsWith("http://") || ep.startsWith("https://") ? ep : `https://${ep}`;
}

function regionFromEndpoint(endpoint: string): string | undefined {
  // Endpoints look like https://obs.af-south-1.myhuaweicloud.com
  const m = endpoint.match(/obs\.([a-z0-9-]+)\.myhuaweicloud/i);
  return m?.[1];
}

class HuaweiObjectStore implements IObjectStore {
  readonly backend = "huawei" as const;
  readonly bucket: string;
  readonly endpoint: string;
  readonly region?: string;
  private client: ObsClientLike;

  constructor() {
    this.bucket = process.env.HUAWEI_OBS_BUCKET!;
    this.endpoint = normalizeEndpoint(process.env.HUAWEI_OBS_ENDPOINT!);
    this.region = regionFromEndpoint(this.endpoint);
    const ObsClient = require("esdk-obs-nodejs") as ObsCtor;
    this.client = new ObsClient({
      access_key_id: process.env.HUAWEI_OBS_AK!,
      secret_access_key: process.env.HUAWEI_OBS_SK!,
      server: this.endpoint,
      timeout: 30,
    });
  }

  private check(r: ObsResponse, op: string): void {
    if (r.CommonMsg.Status >= 300) {
      const raw = `${r.CommonMsg.Code || "ObsError"}: ${r.CommonMsg.Message || `HTTP ${r.CommonMsg.Status}`}`;
      throw new Error(`OBS ${op} failed: ${raw}`);
    }
  }

  async putObject(input: PutObjectInput): Promise<void> {
    const r = await this.client.putObject({
      Bucket: this.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    });
    this.check(r, "putObject");
  }

  async getObject(key: string): Promise<Buffer> {
    const r = await this.client.getObject({ Bucket: this.bucket, Key: key });
    this.check(r, "getObject");
    const body = r.InterfaceResult?.Content;
    if (!body) throw new Error("OBS getObject returned empty body");
    return Buffer.isBuffer(body) ? body : Buffer.from(body);
  }

  async deleteObject(key: string): Promise<void> {
    const r = await this.client.deleteObject({ Bucket: this.bucket, Key: key });
    this.check(r, "deleteObject");
  }

  async headObject(key: string): Promise<ObjectMetadata | null> {
    try {
      const r = await this.client.getObjectMetadata({ Bucket: this.bucket, Key: key });
      if (r.CommonMsg.Status === 404) return null;
      this.check(r, "headObject");
      const ir = (r.InterfaceResult || {}) as Record<string, unknown>;
      // Huawei OBS SDK returns ContentLength as either a number or a numeric
      // string depending on SDK version; coerce defensively.
      const lenRaw = ir.ContentLength;
      const lenNum = typeof lenRaw === "number" ? lenRaw : typeof lenRaw === "string" ? Number(lenRaw) : NaN;
      return {
        key,
        sizeBytes: Number.isFinite(lenNum) ? lenNum : undefined,
        contentType: typeof ir.ContentType === "string" ? ir.ContentType : undefined,
        lastModified: typeof ir.LastModified === "string" ? ir.LastModified : undefined,
      };
    } catch (e) {
      if (e instanceof Error && e.message.includes("404")) return null;
      throw e;
    }
  }

  async getSignedUploadUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
    const headers: Record<string, string> = {};
    if (opts.contentType) headers["Content-Type"] = opts.contentType;
    const r = this.client.createSignedUrlSync({
      Method: "PUT",
      Bucket: this.bucket,
      Key: key,
      Expires: opts.expiresInSeconds ?? 300,
      Headers: Object.keys(headers).length ? headers : undefined,
    });
    return r.SignedUrl;
  }

  async getSignedDownloadUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
    const r = this.client.createSignedUrlSync({
      Method: "GET",
      Bucket: this.bucket,
      Key: key,
      Expires: opts.expiresInSeconds ?? 300,
    });
    return r.SignedUrl;
  }
}

// ---------------------------------------------------------------------------
// In-memory backend (dev/CI fallback)
// ---------------------------------------------------------------------------

class MemoryObjectStore implements IObjectStore {
  readonly backend = "memory" as const;
  readonly bucket = "in-memory";
  readonly endpoint = "memory://local";
  readonly region = "local";
  private store = new Map<string, { body: Buffer; contentType?: string; lastModified: string }>();
  // Token -> { key, mode, expiresAt, contentType }
  private signedTokens = new Map<string, { key: string; mode: "PUT" | "GET"; expiresAt: number; contentType?: string }>();

  async putObject(input: PutObjectInput): Promise<void> {
    const body = typeof input.body === "string" ? Buffer.from(input.body) : input.body;
    this.store.set(input.key, { body, contentType: input.contentType, lastModified: new Date().toISOString() });
  }
  async getObject(key: string): Promise<Buffer> {
    const o = this.store.get(key);
    if (!o) throw new Error(`MemoryObjectStore: key not found: ${key}`);
    return o.body;
  }
  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
  }
  async headObject(key: string): Promise<ObjectMetadata | null> {
    const o = this.store.get(key);
    if (!o) return null;
    return { key, sizeBytes: o.body.length, contentType: o.contentType, lastModified: o.lastModified };
  }
  private mintToken(key: string, mode: "PUT" | "GET", opts: SignedUrlOptions): string {
    const token = randomUUID();
    this.signedTokens.set(token, {
      key,
      mode,
      expiresAt: Date.now() + (opts.expiresInSeconds ?? 300) * 1000,
      contentType: opts.contentType,
    });
    return token;
  }
  async getSignedUploadUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
    // Mint a token (kept for parity / future per-token validation), but
    // return a relative server URL so the browser PUTs through Express.
    this.mintToken(key, "PUT", opts);
    return `/api/uploads/memory-put/${encodeURIComponent(key)}`;
  }
  async getSignedDownloadUrl(key: string, opts: SignedUrlOptions = {}): Promise<string> {
    this.mintToken(key, "GET", opts);
    return `/api/uploads/memory-get/${encodeURIComponent(key)}`;
  }
}

// ---------------------------------------------------------------------------
// Selector + boot helpers
// ---------------------------------------------------------------------------

let cached: IObjectStore | null = null;

export function getObjectStore(): IObjectStore {
  if (cached) return cached;
  if (obsConfigured()) {
    cached = new HuaweiObjectStore();
  } else {
    // Fail-closed in production: never silently swap real storage for a
    // process-local map. Uploads would appear to succeed and then vanish on
    // the next restart. Throwing here means /api/uploads/sign and
    // /api/system/obs-health bubble up a 500 with a clear server log.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "Object storage unavailable: HUAWEI_OBS_AK / HUAWEI_OBS_SK / HUAWEI_OBS_ENDPOINT / HUAWEI_OBS_BUCKET must be set in production.",
      );
    }
    console.warn(
      "[object-store] WARN: HUAWEI_OBS_* env vars missing — using in-memory fallback (DEV ONLY). Set HUAWEI_OBS_AK / HUAWEI_OBS_SK / HUAWEI_OBS_ENDPOINT / HUAWEI_OBS_BUCKET to use real storage.",
    );
    cached = new MemoryObjectStore();
  }
  return cached;
}

export function isObjectStoreReal(): boolean {
  return getObjectStore().backend === "huawei";
}

// ---------------------------------------------------------------------------
// Sanitization + key generation
// ---------------------------------------------------------------------------

export function isAllowedNamespace(ns: string): ns is ObjectNamespace {
  return (ALLOWED_NAMESPACES as readonly string[]).includes(ns);
}

export function safeFileName(name: string): string {
  // Strip path separators, collapse to alphanum / dash / dot / underscore,
  // limit length, lowercase the extension.
  const base = name.split(/[\\/]/).pop() || "file";
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_");
  return cleaned.slice(0, 96) || "file";
}

export function generateStorageKey(
  namespace: ObjectNamespace,
  fileName: string,
  subjectId?: string,
): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  // Optional subjectId scopes the key to its owning entity (e.g. customerId
  // for KYC docs, caseId for evidence). Sanitized to the same charset as
  // file names so it's always path-safe; falls back to the unscoped layout
  // when no subject is provided (e.g. system-health probes).
  const scope = subjectId ? `${safeFileName(subjectId)}/` : "";
  return `${namespace}/${scope}${yyyy}/${mm}/${randomUUID()}-${safeFileName(fileName)}`;
}

// ---------------------------------------------------------------------------
// Error sanitization
// ---------------------------------------------------------------------------

export function sanitizeStoreError(raw: string, status?: number): string {
  const s = raw.toLowerCase();
  if (status === 403 || s.includes("accessdenied") || s.includes("signaturedoesnotmatch")) {
    return "Access denied — verify HUAWEI_OBS_AK / HUAWEI_OBS_SK and bucket permissions.";
  }
  if (status === 404 || s.includes("nosuchbucket")) {
    return "Bucket not found — verify HUAWEI_OBS_BUCKET and HUAWEI_OBS_ENDPOINT region.";
  }
  if (s.includes("getaddrinfo") || s.includes("enotfound") || s.includes("dns")) {
    return "DNS lookup failed for endpoint — verify HUAWEI_OBS_ENDPOINT.";
  }
  if (s.includes("etimedout") || s.includes("timeout")) {
    return "Connection timed out — verify network egress to OBS endpoint.";
  }
  if (s.includes("certificate") || s.includes("self-signed")) {
    return "TLS certificate error connecting to OBS endpoint.";
  }
  return "Storage operation failed. See server logs for details.";
}

// ---------------------------------------------------------------------------
// Round-trip health check (put -> sign GET -> fetch -> delete)
// ---------------------------------------------------------------------------

export interface ObjectStoreHealth {
  ok: boolean;
  backend: "huawei" | "memory";
  bucket: string;
  endpoint: string;
  region?: string;
  latencyMs: number;
  steps?: { put?: number; sign?: number; fetch?: number; delete?: number };
  error?: string;
}

export async function pingObjectStore(): Promise<ObjectStoreHealth> {
  const store = getObjectStore();
  const start = Date.now();
  const probeKey = generateStorageKey("system-health", `probe-${Date.now()}.txt`);
  const payload = Buffer.from(`snapfort-obs-health ${new Date().toISOString()}`);
  const steps: ObjectStoreHealth["steps"] = {};
  try {
    const t0 = Date.now();
    await store.putObject({ key: probeKey, body: payload, contentType: "text/plain" });
    steps.put = Date.now() - t0;

    const t1 = Date.now();
    const url = await store.getSignedDownloadUrl(probeKey, { expiresInSeconds: 60 });
    steps.sign = Date.now() - t1;

    // Memory backend produces non-HTTP URLs; round-trip via getObject instead
    // so the same health flow works in both modes.
    const t2 = Date.now();
    let fetched: Buffer;
    if (store.backend === "huawei" && /^https?:/i.test(url)) {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`signed GET HTTP ${resp.status}`);
      fetched = Buffer.from(await resp.arrayBuffer());
    } else {
      fetched = await store.getObject(probeKey);
    }
    steps.fetch = Date.now() - t2;
    if (!fetched.equals(payload)) throw new Error("round-trip payload mismatch");

    const t3 = Date.now();
    await store.deleteObject(probeKey);
    steps.delete = Date.now() - t3;

    return {
      ok: true,
      backend: store.backend,
      bucket: store.bucket,
      endpoint: store.endpoint,
      region: store.region,
      latencyMs: Date.now() - start,
      steps,
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error(`[object-store] health round-trip failed key=${probeKey}:`, raw);
    // Best-effort cleanup so failed probes don't leak objects.
    try {
      await store.deleteObject(probeKey);
    } catch {
      // ignore
    }
    return {
      ok: false,
      backend: store.backend,
      bucket: store.bucket,
      endpoint: store.endpoint,
      region: store.region,
      latencyMs: Date.now() - start,
      steps,
      error: sanitizeStoreError(raw),
    };
  }
}
