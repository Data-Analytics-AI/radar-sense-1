export type UserRoleForModels = "admin" | "ml_engineer" | "risk_analyst" | "auditor";

export const canPromote = (role: UserRoleForModels) => role === "admin";
export const canRollback = (role: UserRoleForModels) => role === "admin";
export const canRetrain = (role: UserRoleForModels) => role === "admin" || role === "ml_engineer";
export const canEditThreshold = (role: UserRoleForModels) => role === "admin";
export const canViewMonitoring = (role: UserRoleForModels) => role !== "auditor";
export const canViewGovernance = (_role: UserRoleForModels) => true;
export const canViewExplainability = (role: UserRoleForModels) => role !== "auditor";
export const canCompareModels = (role: UserRoleForModels) => role !== "auditor";
