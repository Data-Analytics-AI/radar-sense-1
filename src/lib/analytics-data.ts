// This module previously generated a static analytics fixture. The Analytics
// page now sources every tab from `/api/analytics/:tab` (server-side rollups
// over live Postgres). Only type aliases are re-exported here so the
// per-tab components can keep their `AnalyticsData['fraud']` style annotations.

import type {
  AnalyticsExecutivePayload, AnalyticsFraudPayload, AnalyticsAmlPayload,
  AnalyticsModelsPayload, AnalyticsRulesPayload, AnalyticsGeographyPayload,
  AnalyticsChannelsPayload, AnalyticsUsersPayload, AnalyticsOperationsPayload,
  AnalyticsAuditPayload,
} from "@shared/schema";

export type {
  AnalyticsFiltersInput as AnalyticsFilters,
  AnalyticsTimeRange,
  AnalyticsChannel,
} from "@shared/schema";

export interface AnalyticsData {
  executive: AnalyticsExecutivePayload;
  fraud: AnalyticsFraudPayload;
  aml: AnalyticsAmlPayload;
  models: AnalyticsModelsPayload;
  rules: AnalyticsRulesPayload;
  geography: AnalyticsGeographyPayload;
  channels: AnalyticsChannelsPayload;
  users: AnalyticsUsersPayload;
  operations: AnalyticsOperationsPayload;
  audit: AnalyticsAuditPayload;
}
