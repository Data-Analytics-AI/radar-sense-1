import type { ObjectNamespace } from "@/types/obs";

/**
 * Browser helper for uploading a file to Huawei OBS via the server's
 * presigned-URL flow. Two-step protocol:
 *
 *   1. POST /api/uploads/sign  → returns a 5-minute PUT URL + the deterministic
 *      object key the server picked (namespace/yyyy/mm/uuid-safeName).
 *   2. PUT the raw file bytes to that URL with the matching Content-Type.
 *
 * Returns the object key + size + mime so callers can persist it on the
 * resource that owns the file (e.g. case evidence rows). The server is the
 * source of truth for the key; do NOT compute it client-side.
 */
export interface UploadedObject {
  key: string;
  fileName: string;
  size: number;
  mime: string;
}

const ACTOR_HEADERS: Record<string, string> = {
  // No real auth in SnapFort yet; mirror the placeholder identity used by
  // other write paths so the requireActor gate accepts the request. When
  // signed-in-user wiring lands this should be replaced with the real id.
  "x-actor-user-id": "current-analyst",
  "x-actor-name": "Current Analyst",
};

interface SignResponse {
  key: string;
  url: string;
  method: "PUT";
  expiresInSeconds: number;
  requiredHeaders?: Record<string, string>;
  maxBytes: number;
}

export async function uploadFileToObs(
  namespace: ObjectNamespace,
  file: File,
): Promise<UploadedObject> {
  const mime = file.type || "application/octet-stream";
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...ACTOR_HEADERS },
    body: JSON.stringify({
      namespace,
      fileName: file.name,
      mime,
      sizeBytes: file.size,
    }),
  });
  if (!signRes.ok) {
    const detail = await readError(signRes);
    throw new Error(`Could not get upload URL: ${detail}`);
  }
  const sign = (await signRes.json()) as SignResponse;

  const putRes = await fetch(sign.url, {
    method: "PUT",
    headers: { "Content-Type": mime, ...(sign.requiredHeaders ?? {}) },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(`Upload to object storage failed (${putRes.status} ${putRes.statusText})`);
  }
  return { key: sign.key, fileName: file.name, size: file.size, mime };
}

/**
 * Fetch a short-lived signed GET URL for an object previously uploaded via
 * `uploadFileToObs`. Server enforces the same namespace allow-list.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 300,
): Promise<string> {
  const res = await fetch("/api/uploads/sign-download", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...ACTOR_HEADERS },
    body: JSON.stringify({ key, expiresInSeconds }),
  });
  if (!res.ok) {
    const detail = await readError(res);
    throw new Error(`Could not get download URL: ${detail}`);
  }
  const json = (await res.json()) as { url: string };
  return json.url;
}

async function readError(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j?.error) return j.error;
  } catch {
    /* ignore */
  }
  return `${res.status} ${res.statusText}`;
}
