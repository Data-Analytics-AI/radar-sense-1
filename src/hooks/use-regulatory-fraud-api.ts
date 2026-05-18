import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { RegulatoryReport, FraudRegisterEntry, FraudTimelineEvent } from "@/lib/compliance-data";

const REPORTS_KEY = ["/api/regulatory-reports"] as const;
const FRAUD_KEY = ["/api/fraud-register"] as const;

type RawReport = Omit<RegulatoryReport,
  "submittedAt" | "acknowledgedAt" | "submittedBy" | "reviewedBy" | "regulatoryRef"
> & {
  submittedAt: string | null;
  acknowledgedAt: string | null;
  submittedBy: string | null;
  reviewedBy: string | null;
  regulatoryRef: string | null;
};

type RawFraud = Omit<FraudRegisterEntry,
  "perpetrator" | "resolutionNotes" | "closedAt" | "timeline"
> & {
  perpetrator: string | null;
  resolutionNotes: string | null;
  closedAt: string | null;
  timeline: FraudTimelineEvent[] | null;
};

function normReport(r: RawReport): RegulatoryReport {
  return {
    ...r,
    submittedAt: r.submittedAt ?? undefined,
    acknowledgedAt: r.acknowledgedAt ?? undefined,
    submittedBy: r.submittedBy ?? undefined,
    reviewedBy: r.reviewedBy ?? undefined,
    regulatoryRef: r.regulatoryRef ?? undefined,
  };
}

function normFraud(f: RawFraud): FraudRegisterEntry {
  return {
    ...f,
    perpetrator: f.perpetrator ?? undefined,
    resolutionNotes: f.resolutionNotes ?? undefined,
    closedAt: f.closedAt ?? undefined,
    timeline: f.timeline ?? [],
  };
}

export function useRegulatoryReportsQuery(
  options?: Partial<UseQueryOptions<RegulatoryReport[]>>,
) {
  return useQuery<RegulatoryReport[]>({
    queryKey: REPORTS_KEY,
    queryFn: async () => {
      const res = await fetch("/api/regulatory-reports", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      const raw = (await res.json()) as RawReport[];
      return raw.map(normReport);
    },
    ...options,
  });
}

export type CreateReportPayload = Omit<RegulatoryReport, "createdAt"> & { createdAt?: string };

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation<RegulatoryReport, Error, CreateReportPayload>({
    mutationFn: async (body) => {
      const raw = await apiRequest<RawReport>("POST", "/api/regulatory-reports", body);
      return normReport(raw);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}

export type ReportPatch = Partial<Omit<RegulatoryReport, "id" | "createdAt">>;

export function usePatchReport() {
  const qc = useQueryClient();
  return useMutation<RegulatoryReport, Error, { id: string; patch: ReportPatch }>({
    mutationFn: async ({ id, patch }) => {
      const raw = await apiRequest<RawReport>("PATCH", `/api/regulatory-reports/${id}`, patch);
      return normReport(raw);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: REPORTS_KEY }),
  });
}

export function useFraudRegisterQuery(
  options?: Partial<UseQueryOptions<FraudRegisterEntry[]>>,
) {
  return useQuery<FraudRegisterEntry[]>({
    queryKey: FRAUD_KEY,
    queryFn: async () => {
      const res = await fetch("/api/fraud-register", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      const raw = (await res.json()) as RawFraud[];
      return raw.map(normFraud);
    },
    ...options,
  });
}

export type CreateFraudPayload = FraudRegisterEntry;

export function useCreateFraudEntry() {
  const qc = useQueryClient();
  return useMutation<FraudRegisterEntry, Error, CreateFraudPayload>({
    mutationFn: async (body) => {
      const raw = await apiRequest<RawFraud>("POST", "/api/fraud-register", body);
      return normFraud(raw);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FRAUD_KEY }),
  });
}

export type FraudPatch = Partial<Omit<FraudRegisterEntry, "id" | "incidentDate" | "reportedDate" | "customerId" | "customerName" | "accountNumber">>;

export function usePatchFraudEntry() {
  const qc = useQueryClient();
  return useMutation<FraudRegisterEntry, Error, { id: string; patch: FraudPatch }>({
    mutationFn: async ({ id, patch }) => {
      const raw = await apiRequest<RawFraud>("PATCH", `/api/fraud-register/${id}`, patch);
      return normFraud(raw);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FRAUD_KEY }),
  });
}

export type FraudTimelineAppend = {
  type: string;
  title: string;
  description?: string;
  performedBy: string;
};

export function useAppendFraudTimeline() {
  const qc = useQueryClient();
  return useMutation<FraudRegisterEntry, Error, { id: string; entry: FraudTimelineAppend }>({
    mutationFn: async ({ id, entry }) => {
      const raw = await apiRequest<RawFraud>("POST", `/api/fraud-register/${id}/timeline`, entry);
      return normFraud(raw);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: FRAUD_KEY }),
  });
}
