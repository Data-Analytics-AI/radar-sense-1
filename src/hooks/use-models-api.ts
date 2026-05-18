import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EnhancedMLModel, ModelDashboardPayload, ModelEvaluationDto } from "@/types/models";

export function useModelsQuery() {
  return useQuery<EnhancedMLModel[]>({ queryKey: ["/api/models"] });
}

export function useModelQuery(id: string | null | undefined) {
  return useQuery<EnhancedMLModel>({
    queryKey: ["/api/models", id ?? ""],
    enabled: !!id,
  });
}

export function useModelEvaluationQuery(id: string | null | undefined) {
  return useQuery<ModelEvaluationDto>({
    queryKey: ["/api/models", id ?? "", "evaluation"],
    enabled: !!id,
  });
}

export function useModelDashboardQuery() {
  return useQuery<ModelDashboardPayload>({ queryKey: ["/api/models/dashboard"] });
}

function invalidateModels() {
  queryClient.invalidateQueries({ queryKey: ["/api/models"] });
  queryClient.invalidateQueries({ queryKey: ["/api/models/dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["/api/audit-log"] });
}

export function usePromoteModel() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/models/${id}/promote`, { reason }),
    onSuccess: invalidateModels,
  });
}

export function useRollbackModel() {
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiRequest("POST", `/api/models/${id}/rollback`, { reason }),
    onSuccess: invalidateModels,
  });
}

export function useThresholdModel() {
  return useMutation({
    mutationFn: ({ id, threshold, reason }: { id: string; threshold: number; reason: string }) =>
      apiRequest("POST", `/api/models/${id}/threshold`, { threshold, reason }),
    onSuccess: invalidateModels,
  });
}

export function useRetrainModel() {
  return useMutation({
    mutationFn: (payload: { sourceModelId?: string; modelFamily: string; trainingWindow: string; labelSource: string; featureSetVersion: string; validationStrategy: string; kFolds?: string; minPrecision: string; maxFPR: string; maxLatencyP95: string; reason: string }) =>
      apiRequest("POST", `/api/models/retrain`, payload),
    onSuccess: invalidateModels,
  });
}
