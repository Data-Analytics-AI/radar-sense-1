export type AnalyzeKind =
  | 'kyc_summary'
  | 'fraud_explain'
  | 'str_draft'
  | 'risk_reasoning'
  | 'customer_intel';

let _fallbackToast: ((msg: string) => void) | null = null;
let _fallbackShown = false;

export function registerAIFallbackHandler(handler: (msg: string) => void) {
  _fallbackToast = handler;
}

function notifyFallback(_providerLabel?: string) {
  if (_fallbackShown) return;
  _fallbackShown = true;
  _fallbackToast?.('Custom AI provider failed — temporarily using Azure OpenAI.');
}

export interface AnalyzeMeta {
  result: string;
  fallbackUsed: boolean;
  providerLabel?: string;
  providerId?: string | null;
}

export async function analyzeWithAIMeta(
  kind: AnalyzeKind,
  context: unknown,
): Promise<AnalyzeMeta> {
  const response = await fetch('/api/ai/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, context }),
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const data = (await response.json()) as { result?: string; fallbackUsed?: boolean; providerLabel?: string; providerId?: string | null };
  // Only show the "switched to Azure" toast when a *real* provider fallback
  // happened (providerId present). Deterministic fallback (providerId null)
  // is silent — pages can render their own indicator.
  if (data.fallbackUsed && data.providerId) notifyFallback(data.providerLabel);
  return {
    result: data.result ?? '',
    fallbackUsed: !!data.fallbackUsed,
    providerLabel: data.providerLabel,
    providerId: data.providerId ?? null,
  };
}

export async function analyzeWithAI(
  kind: AnalyzeKind,
  context: unknown,
): Promise<string> {
  const m = await analyzeWithAIMeta(kind, context);
  return m.result;
}

export { notifyFallback as _notifyFallbackForChat };
