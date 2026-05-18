import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { getStorage } from "./storage.js";

const COOKIE_NAME = "sf_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12h

function sessionSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    // Fail loud in production: refuse to mint sessions with a default secret.
    throw new Error("SESSION_SECRET env var must be set (>=16 chars) in production.");
  }
  return "dev-only-insecure-snapfort-session-secret-change-me";
}

function sign(value: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

function makeCookie(userId: string): { value: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const sig = sign(payload);
  return { value: `${payload}.${sig}`, expiresAt };
}

export function verifyCookie(cookie: string | undefined | null): { userId: string; expiresAt: number } | null {
  if (!cookie) return null;
  const parts = cookie.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAtStr, sig] = parts;
  if (!userId || !expiresAtStr || !sig) return null;
  const expected = sign(`${userId}.${expiresAtStr}`);
  // Constant-time compare.
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return null;
  return { userId, expiresAt };
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const seg of header.split(";")) {
    const i = seg.indexOf("=");
    if (i < 0) continue;
    const k = seg.slice(0, i).trim();
    const v = decodeURIComponent(seg.slice(i + 1).trim());
    if (k) out[k] = v;
  }
  return out;
}

export function getSessionUserId(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  const verified = verifyCookie(cookies[COOKIE_NAME]);
  return verified?.userId ?? null;
}

/**
 * Resolve the acting user id. Source of truth in production is the verified
 * session cookie. In non-production we additionally accept the legacy
 * `x-actor-user-id` header so the dev "Act as (demo)" switcher keeps working
 * without a real login flow.
 */
export function resolveActorId(req: Request): string | null {
  const fromSession = getSessionUserId(req);
  if (fromSession) return fromSession;
  if (process.env.NODE_ENV !== "production") {
    const h = req.header("x-actor-user-id");
    if (h && h.trim()) return h.trim();
  }
  return null;
}

export function setSessionCookie(res: Response, userId: string): { expiresAt: number } {
  const { value, expiresAt } = makeCookie(userId);
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (isProd) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
  return { expiresAt };
}

export function clearSessionCookie(res: Response): void {
  const parts = [`${COOKIE_NAME}=`, "HttpOnly", "Path=/", "SameSite=Lax", "Max-Age=0"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

// ---------- password hashing (scrypt, no external deps) ----------

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const N = parseInt(parts[1], 10);
  const r = parseInt(parts[2], 10);
  const p = parseInt(parts[3], 10);
  const salt = Buffer.from(parts[4], "hex");
  const expected = Buffer.from(parts[5], "hex");
  try {
    const hash = crypto.scryptSync(password, salt, expected.length, { N, r, p });
    return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
  } catch {
    return false;
  }
}

// ---------- middleware ----------

export async function requireActor(req: Request, res: Response, next: NextFunction): Promise<void> {
  const id = resolveActorId(req);
  if (!id) {
    res.status(401).json({ error: "Not signed in." });
    return;
  }
  // Stash on the request so downstream handlers and the audit-log helper
  // can access the verified actor without reparsing the cookie or
  // re-querying the user row.
  (req as Request & { actorUserId?: string }).actorUserId = id;
  try {
    const u = await getStorage().getUser(id);
    if (u?.name) (req as Request & { actorName?: string }).actorName = u.name;
  } catch {
    /* fall back to header / system */
  }
  next();
}

export function getActorUserId(req: Request): string | null {
  const cached = (req as Request & { actorUserId?: string }).actorUserId;
  if (cached) return cached;
  return resolveActorId(req);
}

