/**
 * Mirror of `ObjectNamespace` from server/object-store.ts. Kept as a typed
 * union (not just a string) so the obs-upload helper can refuse calls that
 * try to use namespaces the server will reject.
 */
export type ObjectNamespace =
  | "customer-documents"
  | "case-evidence"
  | "reports"
  | "ai-chats";
