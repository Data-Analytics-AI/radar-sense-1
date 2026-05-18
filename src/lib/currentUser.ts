// Client-side actor helpers. The verified signed-in user is established by
// the server's session cookie (see /api/auth/login) and exposed via
// /api/auth/me — there is no client-side source of truth for identity.
//
// In non-production builds we still support the legacy "Act as (demo)"
// switcher: it stores a user id in localStorage and we send it as the
// `x-actor-user-id` header so devs can swap roles without going through the
// login flow. In production the header is ignored by the server.

const ID_KEY = "snapfort.currentUser.id";
const NAME_KEY = "snapfort.currentUser.name";

const isProd = (() => {
  try { return import.meta.env?.PROD === true; } catch { return false; }
})();

function readLs(key: string): string | null {
  try { return typeof window !== "undefined" ? window.localStorage.getItem(key) : null; }
  catch { return null; }
}
function writeLs(key: string, val: string): void {
  try { if (typeof window !== "undefined") window.localStorage.setItem(key, val); }
  catch { /* ignore quota / privacy mode */ }
}
function clearLs(key: string): void {
  try { if (typeof window !== "undefined") window.localStorage.removeItem(key); }
  catch { /* ignore */ }
}

export function getCurrentUserId(): string {
  return readLs(ID_KEY) || "";
}

export function getCurrentUserName(): string {
  return readLs(NAME_KEY) || "";
}

export function setCurrentUser(id: string, name: string): void {
  writeLs(ID_KEY, id);
  writeLs(NAME_KEY, name);
}

export function clearCurrentUser(): void {
  clearLs(ID_KEY);
  clearLs(NAME_KEY);
}

/**
 * Headers attached to every API request. The session cookie is the source
 * of truth for the signed-in user; in dev we additionally send the legacy
 * actor headers to power the "Act as (demo)" switcher.
 */
export function actorHeaders(): Record<string, string> {
  if (isProd) return {};
  const id = getCurrentUserId();
  const name = getCurrentUserName();
  if (!id) return {};
  return { "x-actor-user-id": id, "x-actor-name": name || id };
}

export const isDemoSwitcherEnabled = !isProd || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === "true";
