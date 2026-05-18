import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Alert, Case, CaseNote, CaseTimelineEvent, LinkedEntity, Evidence } from "@/types";

/**
 * REST hooks for the `alerts` and `cases` Drizzle tables on Huawei RDS.
 *
 * Mutations invalidate every cache entry whose first segment matches the
 * touched resource so list views and detail views refresh together.
 */

const ALERTS_KEY = ["/api/alerts"] as const;
const CASES_KEY = ["/api/cases"] as const;

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

export function useAlertsQuery(options?: Partial<UseQueryOptions<Alert[]>>) {
  return useQuery<Alert[]>({ queryKey: ALERTS_KEY, ...options });
}

export function useAlertQuery(id: string | undefined, options?: Partial<UseQueryOptions<Alert>>) {
  return useQuery<Alert>({
    queryKey: ["/api/alerts", id ?? ""],
    enabled: Boolean(id),
    ...options,
  });
}

export type AlertPatch = Partial<Pick<Alert, "status" | "assignedTo" | "resolution" | "severity" | "riskScore" | "description">>;

export function usePatchAlert() {
  const qc = useQueryClient();
  return useMutation<Alert, Error, { id: string; patch: AlertPatch }>({
    mutationFn: ({ id, patch }) => apiRequest<Alert>("PATCH", `/api/alerts/${id}`, patch),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ALERTS_KEY });
      qc.invalidateQueries({ queryKey: ["/api/alerts", vars.id] });
    },
  });
}

export interface AlertNotePayload { author: string; text: string; ts?: string }

export function useAddAlertNote() {
  const qc = useQueryClient();
  return useMutation<Alert, Error, { id: string; note: AlertNotePayload }>({
    mutationFn: ({ id, note }) => apiRequest<Alert>("POST", `/api/alerts/${id}/notes`, note),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ALERTS_KEY });
      qc.invalidateQueries({ queryKey: ["/api/alerts", vars.id] });
    },
  });
}

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------

export function useCasesQuery(options?: Partial<UseQueryOptions<Case[]>>) {
  return useQuery<Case[]>({ queryKey: CASES_KEY, ...options });
}

export function useCaseQuery(id: string | undefined, options?: Partial<UseQueryOptions<Case>>) {
  return useQuery<Case>({
    queryKey: ["/api/cases", id ?? ""],
    enabled: Boolean(id),
    ...options,
  });
}

export type NewCasePayload = Omit<Case, "createdAt" | "updatedAt"> & {
  createdAt?: string;
  updatedAt?: string;
};

export function useCreateCase() {
  const qc = useQueryClient();
  return useMutation<Case, Error, NewCasePayload>({
    mutationFn: (body) => apiRequest<Case>("POST", "/api/cases", body),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: CASES_KEY });
      qc.invalidateQueries({ queryKey: ["/api/cases", created.id] });
    },
  });
}

export type CasePatch = Partial<Pick<Case,
  "status" | "priority" | "assignedTo" | "tags" | "description" | "resolution" |
  "notes" | "timeline" | "linkedEntities" | "evidence"
>>;

export function usePatchCase(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation<Case, Error, CasePatch>({
    mutationFn: (patch) => {
      if (!id) throw new Error("Case id required");
      return apiRequest<Case>("PATCH", `/api/cases/${id}`, patch);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CASES_KEY });
      if (id) qc.invalidateQueries({ queryKey: ["/api/cases", id] });
    },
  });
}

function makeCaseAppender<T>(field: "notes" | "timeline" | "entities" | "evidence") {
  return function useAppender(id: string | undefined) {
    const qc = useQueryClient();
    return useMutation<Case, Error, T>({
      mutationFn: (entry) => {
        if (!id) throw new Error("Case id required");
        return apiRequest<Case>("POST", `/api/cases/${id}/${field}`, entry);
      },
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: CASES_KEY });
        if (id) qc.invalidateQueries({ queryKey: ["/api/cases", id] });
      },
    });
  };
}

export const useAddCaseNote = makeCaseAppender<CaseNote>("notes");
export const useAddCaseTimeline = makeCaseAppender<CaseTimelineEvent>("timeline");
export const useAddCaseEntity = makeCaseAppender<LinkedEntity>("entities");
export const useAddCaseEvidence = makeCaseAppender<Evidence>("evidence");
