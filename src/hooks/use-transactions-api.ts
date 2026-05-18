import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Transaction, GeoLocation } from "@/types";

const TXNS_KEY = ["/api/transactions"] as const;

type RawTransaction = Omit<Transaction,
  "geoLocation" | "beneficiaryId" | "beneficiaryAccount"
> & {
  geoLocation: GeoLocation | null;
  beneficiaryId: string | null;
  beneficiaryAccount: string | null;
};

const FALLBACK_GEO: GeoLocation = { latitude: 0, longitude: 0, country: "Nigeria", city: "Lagos" };

export function normTransaction(t: RawTransaction): Transaction {
  return {
    ...t,
    geoLocation: t.geoLocation ?? FALLBACK_GEO,
    beneficiaryId: t.beneficiaryId ?? undefined,
    beneficiaryAccount: t.beneficiaryAccount ?? undefined,
  };
}

export interface TransactionsFilter {
  customerId?: string;
  search?: string;
  type?: string;
  status?: string;
  riskLevel?: string;
  riskMin?: number;
  riskMax?: number;
  since?: string;
  limit?: number;
}

function buildQs(f: TransactionsFilter): string {
  const sp = new URLSearchParams();
  if (f.customerId) sp.set("customerId", f.customerId);
  if (f.search) sp.set("search", f.search);
  if (f.type) sp.set("type", f.type);
  if (f.status) sp.set("status", f.status);
  if (f.riskLevel) sp.set("riskLevel", f.riskLevel);
  if (typeof f.riskMin === "number") sp.set("riskMin", String(f.riskMin));
  if (typeof f.riskMax === "number") sp.set("riskMax", String(f.riskMax));
  if (f.since) sp.set("since", f.since);
  if (typeof f.limit === "number") sp.set("limit", String(f.limit));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function useTransactionsQuery(
  filters: TransactionsFilter = {},
  options?: Partial<UseQueryOptions<Transaction[]>>,
) {
  return useQuery<Transaction[]>({
    queryKey: [...TXNS_KEY, filters],
    queryFn: async () => {
      const res = await fetch(`/api/transactions${buildQs(filters)}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      const raw = (await res.json()) as RawTransaction[];
      return raw.map(normTransaction);
    },
    ...options,
  });
}

export function useTransactionQuery(id: string | null | undefined) {
  return useQuery<Transaction>({
    queryKey: [...TXNS_KEY, "id", id],
    enabled: !!id,
    queryFn: async () => {
      const res = await fetch(`/api/transactions/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return normTransaction((await res.json()) as RawTransaction);
    },
  });
}

export function useCreateTransaction() {
  const qc = useQueryClient();
  return useMutation<Transaction, Error, Transaction>({
    mutationFn: async (body) => {
      const raw = await apiRequest<RawTransaction>("POST", "/api/transactions", body);
      return normTransaction(raw);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TXNS_KEY }),
  });
}
