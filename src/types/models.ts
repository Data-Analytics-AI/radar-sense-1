import type { ModelRow, ModelEvaluationRow } from "../../shared/schema";

export type ModelStage = "production" | "staging" | "candidate" | "archived" | "retired";
export type HealthStatus = "healthy" | "degraded" | "investigate";
export type ModelPurpose = "fraud" | "aml" | "both";
export type ModelCategory = "supervised" | "anomaly";

export interface ModelAuditEntry {
  id: string;
  action: string;
  actor: string;
  timestamp: string;
  details: string;
}

export interface ApprovalEntry {
  role: string;
  name: string;
  action: string;
  date: string;
}

export interface ModelVersionEntry {
  version: string;
  stage: ModelStage;
  trainedAt: string;
  metrics: { precision: number; recall: number; f1Score: number; aucRoc: number };
}

export interface FeatureDrift {
  feature: string;
  psi: number;
  ksStatistic: number;
  status: "stable" | "warning" | "critical";
}

export interface DataQualityCheck {
  metric: string;
  value: number;
  threshold: number;
  status: "pass" | "warning" | "fail";
}

export interface ConfusionMatrix {
  truePositive: number;
  falsePositive: number;
  trueNegative: number;
  falseNegative: number;
}

export interface SegmentMetric {
  segment: string;
  precision: number;
  recall: number;
  f1Score: number;
  volume: number;
}

export interface FeatureImportance {
  feature: string;
  importance: number;
  direction: "positive" | "negative";
}

export interface DetectionTrendPoint { date: string; detections: number; falsePositives: number }
export interface LossTrendPoint { month: string; prevented: number; actual: number }
export interface ScoreDistributionBand { band: string; count: number; pct: number }
export interface PrecisionRecallPoint { threshold: string; precision: number; recall: number }
export interface StabilityPoint { week: string; confidence: number; calibration: number }
export interface InferenceChannel { channel: string; volume: number; pct: number }

export type ModelDto = Omit<ModelRow, "trainedAt" | "lastDeployed" | "createdAt" | "updatedAt"> & {
  trainedAt: string;
  lastDeployed: string | null;
  createdAt: string;
  updatedAt: string;
};

export interface EnhancedMLModel extends Omit<ModelDto, "stage" | "healthStatus" | "purpose" | "category"> {
  stage: ModelStage;
  healthStatus: HealthStatus;
  purpose: ModelPurpose;
  category: ModelCategory;
  auditLog: ModelAuditEntry[];
}

export type ModelEvaluationDto = Omit<ModelEvaluationRow, "generatedAt"> & { generatedAt: string };

export interface ModelDashboardPayload {
  productionModel: EnhancedMLModel;
  evaluation: ModelEvaluationDto;
}
