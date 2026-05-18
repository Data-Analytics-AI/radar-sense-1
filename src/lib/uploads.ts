// Browser-side helpers for uploading artifacts directly to Huawei OBS via the
// server-issued presigned URLs. The server never touches the file bytes —
// the client PUTs straight to OBS, then sends only the resulting `storageKey`
// back to the API for persistence.

export type UploadNamespace =
  | 'customer-documents'
  | 'case-evidence'
  | 'reports'
  | 'ai-chats';

const ACTOR_HEADER_KEY = 'snapfort_ui_actor_id';

function getOrCreateActorId(): string {
  try {
    let v = window.localStorage.getItem(ACTOR_HEADER_KEY);
    if (!v) {
      v = `ui-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
      window.localStorage.setItem(ACTOR_HEADER_KEY, v);
    }
    return v;
  } catch {
    return 'ui-anonymous';
  }
}

interface SignUploadResponse {
  key: string;
  url: string;
  method: 'PUT';
  expiresInSeconds: number;
  backend: 'huawei' | 'memory';
  bucket: string;
  maxBytes: number;
  requiredHeaders: Record<string, string>;
}

interface SignDownloadResponse {
  key: string;
  url: string;
  method: 'GET';
  expiresInSeconds: number;
}

async function signUpload(
  namespace: UploadNamespace,
  fileName: string,
  mime: string,
  sizeBytes: number,
  subjectId?: string,
): Promise<SignUploadResponse> {
  const res = await fetch('/api/uploads/sign', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-actor-user-id': getOrCreateActorId(),
      'x-actor-name': 'onboarding-ui',
    },
    body: JSON.stringify({ namespace, fileName, mime, sizeBytes, subjectId }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.error) detail = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(`Could not get upload URL: ${detail}`);
  }
  return (await res.json()) as SignUploadResponse;
}

export interface UploadedArtifact {
  storageKey: string;
  name: string;
  size: number;
  mime: string;
}

export async function uploadFileToObs(
  file: File,
  namespace: UploadNamespace,
  subjectId?: string,
): Promise<UploadedArtifact> {
  const mime = file.type || 'application/octet-stream';
  const signed = await signUpload(namespace, file.name, mime, file.size, subjectId);

  const headers: Record<string, string> = { 'Content-Type': mime };
  // For real OBS the server-issued URL already encodes the auth and points at
  // the OBS endpoint. The in-memory dev backend returns a relative URL pointing
  // back at our own Express server.
  const isRelative = signed.url.startsWith('/');

  const putRes = await fetch(signed.url, {
    method: 'PUT',
    headers,
    body: file,
    credentials: isRelative ? 'include' : 'omit',
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (HTTP ${putRes.status}). Try again.`);
  }

  return {
    storageKey: signed.key,
    name: file.name,
    size: file.size,
    mime,
  };
}

export async function getDownloadUrl(
  storageKey: string,
  expiresInSeconds = 300,
): Promise<string> {
  // Hit /api/uploads/sign-download with the actor headers the server requires
  // (requireActor middleware). apiRequest() doesn't send those, so this
  // helper does its own fetch.
  const res = await fetch('/api/uploads/sign-download', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'x-actor-user-id': getOrCreateActorId(),
      'x-actor-name': 'onboarding-ui',
    },
    body: JSON.stringify({ key: storageKey, expiresInSeconds }),
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.error) detail = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(`Could not get download URL: ${detail}`);
  }
  const json = (await res.json()) as SignDownloadResponse;
  return json.url;
}

export function actorHeaders(): Record<string, string> {
  return {
    'x-actor-user-id': getOrCreateActorId(),
    'x-actor-name': 'onboarding-ui',
  };
}
