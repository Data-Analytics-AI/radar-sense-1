import {
  Shield, Bell, Database, Globe, Key, Server, Brain, Lock,
  GitBranch, FileText, Cloud, Flag, HardDrive, Activity, Wrench,
  type LucideIcon
} from 'lucide-react';

export type SettingsSectionId =
  | 'risk' | 'notifications' | 'compliance' | 'integrations'
  | 'database' | 'model' | 'security' | 'workflow'
  | 'audit' | 'environment' | 'features' | 'backup'
  | 'health' | 'advanced';

export interface SettingsSectionConfig {
  id: SettingsSectionId;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
  { id: 'risk', label: 'Risk Configuration', icon: Shield, description: 'Risk thresholds, scoring, and simulation' },
  { id: 'notifications', label: 'Notifications & Alerts', icon: Bell, description: 'Alert routing, channels, and preferences' },
  { id: 'compliance', label: 'Data Retention & Compliance', icon: FileText, description: 'Retention policies, regulatory profiles, anonymization' },
  { id: 'integrations', label: 'Integrations', icon: Globe, description: 'Core banking APIs, webhooks, and connectors' },
  { id: 'database', label: 'Database & Storage', icon: Database, description: 'Database connections, replicas, and encryption' },
  { id: 'model', label: 'Model & AI Configuration', icon: Brain, description: 'ML models, AI assistant, feature store' },
  { id: 'security', label: 'Security & Access Controls', icon: Lock, description: 'Authentication, MFA, API security, IP controls' },
  { id: 'workflow', label: 'Workflow & Escalations', icon: GitBranch, description: 'SLA thresholds, escalation tiers, auto-assign' },
  { id: 'audit', label: 'Audit & Logging', icon: FileText, description: 'Log retention, SIEM integration, change tracking' },
  { id: 'environment', label: 'Environment & Deployment', icon: Cloud, description: 'Environment config, debug mode, versioning' },
  { id: 'features', label: 'Feature Flags', icon: Flag, description: 'Feature toggles and gradual rollouts' },
  { id: 'backup', label: 'Backup & Recovery', icon: HardDrive, description: 'Backup schedules, snapshots, disaster recovery' },
  { id: 'health', label: 'System Health', icon: Activity, description: 'Uptime, latency, resource utilization' },
  { id: 'advanced', label: 'Advanced', icon: Wrench, description: 'Advanced platform configuration' },
];

export interface AuditEntry {
  id: string;
  section: SettingsSectionId;
  action: string;
  field: string;
  oldValue: string;
  newValue: string;
  user: string;
  timestamp: string;
}

export interface RiskSettings {
  lowThreshold: number;
  mediumThreshold: number;
  highThreshold: number;
  criticalThreshold: number;
  alertThreshold: number;
  autoCaseThreshold: number;
  autoBlockThreshold: number;
  dynamicThresholds: boolean;
  countryThresholds: { country: string; modifier: number }[];
  channelThresholds: { channel: string; modifier: number }[];
  merchantCategoryThresholds: { category: string; modifier: number }[];
  formulaPreview: string;
}

export interface NotificationSettings {
  criticalAlerts: boolean;
  highRiskAlerts: boolean;
  caseEscalations: boolean;
  soundAlerts: boolean;
  emailNotifications: boolean;
  smsNotifications: boolean;
  slackIntegration: boolean;
  slackWebhookUrl: string;
  emailRecipients: string;
  digestFrequency: string;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface ComplianceSettings {
  transactionRetention: string;
  auditLogRetention: string;
  caseRetention: string;
  sarRetention: string;
  regulatoryProfile: string;
  anonymizationPolicy: string;
  rightToBeForgotten: boolean;
  autoDeleteEnabled: boolean;
  autoDeleteSchedule: string;
  archiveDestination: string;
  countryPolicies: { country: string; retention: string }[];
}

export interface IntegrationSettings {
  coreBankingType: string;
  baseUrl: string;
  apiVersion: string;
  authType: string;
  clientId: string;
  clientSecret: string;
  timeout: number;
  retryAttempts: number;
  circuitBreakerThreshold: number;
  healthStatus: string;
  lastHealthCheck: string;
  latency: number;
  webhookUrl: string;
  webhookSecret: string;
  webhookEvents: string[];
  webhookRetryPolicy: string;
  signatureVerification: boolean;
}

export interface DatabaseSettings {
  primaryDbType: string;
  primaryHost: string;
  primaryPort: number;
  primaryDbName: string;
  primarySsl: boolean;
  primaryUsername: string;
  primaryPassword: string;
  primaryPoolSize: number;
  primaryMaxConnections: number;
  readReplicaEnabled: boolean;
  readReplicaHost: string;
  analyticsDbEnabled: boolean;
  analyticsDbHost: string;
  dataLakeType: string;
  dataLakeBucket: string;
  objectStorageType: string;
  objectStorageBucket: string;
  encryptionAtRest: boolean;
  rowLevelEncryption: boolean;
  dataMasking: boolean;
  connectionStatus: string;
  pingTime: number;
  poolStatus: string;
  lastSuccessfulQuery: string;
}

export interface ModelSettings {
  activeModelName: string;
  activeModelVersion: string;
  lastTrainedDate: string;
  deploymentEnv: string;
  confidenceThreshold: number;
  riskWeightMultipliers: { factor: string; weight: number }[];
  aiProvider: string;
  aiModelName: string;
  aiTemperature: number;
  aiMaxTokens: number;
  aiPromptVersion: string;
  ragEnabled: boolean;
  driftThreshold: number;
  autoRetraining: boolean;
  performanceDegradationAlert: number;
  featureStoreSource: string;
  featureStoreSyncFreq: string;
  featureFreshnessThreshold: string;
  shadowModelTesting: boolean;
  championChallengerMode: string;
}

export interface SecuritySettings {
  ssoProvider: string;
  enforceMfa: boolean;
  passwordMinLength: number;
  passwordComplexity: string;
  sessionTimeout: number;
  concurrentSessionLimit: number;
  ipWhitelistEnabled: boolean;
  ipWhitelist: string[];
  geoBlocking: boolean;
  blockedCountries: string[];
  apiRateLimit: number;
  apiIpRestriction: boolean;
  tokenExpiryDuration: number;
  mfaAdoption: number;
  failedLogins24h: number;
  suspiciousLogins: number;
  lockedAccounts: number;
}

export interface WorkflowSettings {
  slaThresholds: { severity: string; hours: number }[];
  escalationTiers: { tier: number; name: string; timeoutHours: number; notifyRole: string }[];
  autoAssignEnabled: boolean;
  autoAssignLogic: string;
  reassignmentTimeout: number;
  aiEscalationRecommendation: boolean;
  escalationNotificationRouting: string;
}

export interface AuditSettings {
  logRetentionPeriod: string;
  immutableLogs: boolean;
  logExportEnabled: boolean;
  logExportFormat: string;
  logStreamingEnabled: boolean;
  logStreamingEndpoint: string;
  siemIntegrationType: string;
  siemEndpoint: string;
  lastConfigChange: string;
  lastChangedBy: string;
}

export interface EnvironmentSettings {
  currentEnvironment: string;
  debugMode: boolean;
  maintenanceMode: boolean;
  systemVersion: string;
  buildNumber: string;
  containerVersion: string;
  dockerImageTag: string;
  kubernetesNamespace: string;
  featureIsolation: boolean;
}

export interface FeatureFlagSettings {
  flags: {
    id: string;
    name: string;
    description: string;
    enabled: boolean;
    rolloutPercentage: number;
    tenantSpecific: boolean;
  }[];
}

export interface BackupSettings {
  backupFrequency: string;
  snapshotRetention: string;
  lastBackup: string;
  nextBackup: string;
  disasterRecoveryRegion: string;
  failoverEnabled: boolean;
  replicationLag: number;
  restorePoints: { id: string; timestamp: string; size: string; type: string }[];
}

export interface SystemHealthSettings {
  apiUptime: number;
  dbUptime: number;
  eventQueueBacklog: number;
  avgScoringLatency: number;
  modelInferenceTime: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  lastRestart: string;
  cacheSize: string;
}

export interface AdvancedSettings {
  timezone: string;
  dateFormat: string;
  compactView: boolean;
  apiEndpoint: string;
  maxConcurrentJobs: number;
  batchProcessingSize: number;
  telemetryEnabled: boolean;
  experimentalFeatures: boolean;
}

export interface AllSettings {
  risk: RiskSettings;
  notifications: NotificationSettings;
  compliance: ComplianceSettings;
  integrations: IntegrationSettings;
  database: DatabaseSettings;
  model: ModelSettings;
  security: SecuritySettings;
  workflow: WorkflowSettings;
  audit: AuditSettings;
  environment: EnvironmentSettings;
  features: FeatureFlagSettings;
  backup: BackupSettings;
  health: SystemHealthSettings;
  advanced: AdvancedSettings;
}

export const DEFAULT_SETTINGS: AllSettings = {
  risk: {
    lowThreshold: 25,
    mediumThreshold: 50,
    highThreshold: 75,
    criticalThreshold: 100,
    alertThreshold: 65,
    autoCaseThreshold: 80,
    autoBlockThreshold: 95,
    dynamicThresholds: false,
    countryThresholds: [
      { country: 'Nigeria', modifier: 1.3 },
      { country: 'Russia', modifier: 1.4 },
      { country: 'Iran', modifier: 1.5 },
      { country: 'North Korea', modifier: 1.5 },
    ],
    channelThresholds: [
      { channel: 'Web', modifier: 1.0 },
      { channel: 'Mobile', modifier: 1.1 },
      { channel: 'ATM', modifier: 1.2 },
      { channel: 'POS', modifier: 0.9 },
      { channel: 'Branch', modifier: 0.8 },
    ],
    merchantCategoryThresholds: [
      { category: 'Gambling', modifier: 1.5 },
      { category: 'Crypto Exchange', modifier: 1.4 },
      { category: 'Money Transfer', modifier: 1.3 },
      { category: 'Electronics', modifier: 1.1 },
    ],
    formulaPreview: 'base_score × channel_mod × country_mod × merchant_mod',
  },
  notifications: {
    criticalAlerts: true,
    highRiskAlerts: true,
    caseEscalations: true,
    soundAlerts: false,
    emailNotifications: true,
    smsNotifications: false,
    slackIntegration: false,
    slackWebhookUrl: '',
    emailRecipients: 'compliance@bank.com, fraud-ops@bank.com',
    digestFrequency: 'realtime',
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '07:00',
  },
  compliance: {
    transactionRetention: '7y',
    auditLogRetention: '7y',
    caseRetention: '10y',
    sarRetention: '10y',
    regulatoryProfile: 'fatf',
    anonymizationPolicy: 'hash',
    rightToBeForgotten: false,
    autoDeleteEnabled: false,
    autoDeleteSchedule: 'monthly',
    archiveDestination: 'cold-storage',
    countryPolicies: [
      { country: 'EU (GDPR)', retention: '5y' },
      { country: 'US (FinCEN)', retention: '7y' },
      { country: 'Nigeria (CBN)', retention: '10y' },
      { country: 'UK (FCA)', retention: '7y' },
    ],
  },
  integrations: {
    coreBankingType: 'rest',
    baseUrl: 'https://corebanking.internal.bank/api',
    apiVersion: 'v2.1',
    authType: 'oauth2',
    clientId: 'snapfort-prod-client',
    clientSecret: '••••••••••••••••••••',
    timeout: 30000,
    retryAttempts: 3,
    circuitBreakerThreshold: 5,
    healthStatus: 'healthy',
    lastHealthCheck: '2026-02-20T14:32:00Z',
    latency: 142,
    webhookUrl: 'https://bank-system.internal/webhooks/snapfort',
    webhookSecret: '••••••••••••••••••••',
    webhookEvents: ['alert.created', 'case.updated', 'sar.filed', 'rule.updated'],
    webhookRetryPolicy: '3x-exponential',
    signatureVerification: true,
  },
  database: {
    primaryDbType: 'postgres',
    primaryHost: 'db-primary.internal.bank',
    primaryPort: 5432,
    primaryDbName: 'snapfort_prod',
    primarySsl: true,
    primaryUsername: 'snapfort_app',
    primaryPassword: '••••••••••••••••••••',
    primaryPoolSize: 20,
    primaryMaxConnections: 100,
    readReplicaEnabled: true,
    readReplicaHost: 'db-replica.internal.bank',
    analyticsDbEnabled: true,
    analyticsDbHost: 'analytics-db.internal.bank',
    dataLakeType: 's3',
    dataLakeBucket: 'snapfort-datalake-prod',
    objectStorageType: 's3',
    objectStorageBucket: 'snapfort-evidence-prod',
    encryptionAtRest: true,
    rowLevelEncryption: true,
    dataMasking: true,
    connectionStatus: 'connected',
    pingTime: 3.2,
    poolStatus: '18/20 active',
    lastSuccessfulQuery: '2026-02-20T14:35:12Z',
  },
  model: {
    activeModelName: 'FraudNet-XGBoost',
    activeModelVersion: 'v3.2.1',
    lastTrainedDate: '2026-02-15',
    deploymentEnv: 'production',
    confidenceThreshold: 0.75,
    riskWeightMultipliers: [
      { factor: 'Transaction Amount', weight: 1.4 },
      { factor: 'Velocity', weight: 1.3 },
      { factor: 'Geolocation', weight: 1.2 },
      { factor: 'Device Fingerprint', weight: 1.1 },
      { factor: 'Behavioral Pattern', weight: 1.0 },
    ],
    aiProvider: 'azure-openai',
    aiModelName: 'gpt-4o',
    aiTemperature: 0.3,
    aiMaxTokens: 4096,
    aiPromptVersion: 'v2.4',
    ragEnabled: true,
    driftThreshold: 3.0,
    autoRetraining: false,
    performanceDegradationAlert: 5,
    featureStoreSource: 'internal',
    featureStoreSyncFreq: '15min',
    featureFreshnessThreshold: '1h',
    shadowModelTesting: false,
    championChallengerMode: 'champion',
  },
  security: {
    ssoProvider: 'azure-ad',
    enforceMfa: true,
    passwordMinLength: 12,
    passwordComplexity: 'strong',
    sessionTimeout: 30,
    concurrentSessionLimit: 2,
    ipWhitelistEnabled: true,
    ipWhitelist: ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
    geoBlocking: false,
    blockedCountries: [],
    apiRateLimit: 1000,
    apiIpRestriction: true,
    tokenExpiryDuration: 3600,
    mfaAdoption: 94.2,
    failedLogins24h: 23,
    suspiciousLogins: 3,
    lockedAccounts: 2,
  },
  workflow: {
    slaThresholds: [
      { severity: 'Critical', hours: 4 },
      { severity: 'High', hours: 8 },
      { severity: 'Medium', hours: 24 },
      { severity: 'Low', hours: 72 },
    ],
    escalationTiers: [
      { tier: 1, name: 'Analyst', timeoutHours: 4, notifyRole: 'Senior Analyst' },
      { tier: 2, name: 'Senior Analyst', timeoutHours: 8, notifyRole: 'Team Lead' },
      { tier: 3, name: 'Team Lead', timeoutHours: 12, notifyRole: 'Head of Compliance' },
      { tier: 4, name: 'Head of Compliance', timeoutHours: 24, notifyRole: 'CISO' },
    ],
    autoAssignEnabled: true,
    autoAssignLogic: 'round-robin',
    reassignmentTimeout: 48,
    aiEscalationRecommendation: true,
    escalationNotificationRouting: 'email+slack',
  },
  audit: {
    logRetentionPeriod: '7y',
    immutableLogs: true,
    logExportEnabled: true,
    logExportFormat: 'json',
    logStreamingEnabled: false,
    logStreamingEndpoint: '',
    siemIntegrationType: 'none',
    siemEndpoint: '',
    lastConfigChange: '2026-02-20T10:15:00Z',
    lastChangedBy: 'admin@bank.com',
  },
  environment: {
    currentEnvironment: 'production',
    debugMode: false,
    maintenanceMode: false,
    systemVersion: '4.2.1',
    buildNumber: '2026.02.20.1847',
    containerVersion: '4.2.1-alpine',
    dockerImageTag: 'snapfort/platform:4.2.1',
    kubernetesNamespace: 'snapfort-prod',
    featureIsolation: true,
  },
  features: {
    flags: [
      { id: 'graph-ai', name: 'Graph AI Analysis', description: 'AI-powered graph analysis for fraud ring detection', enabled: true, rolloutPercentage: 100, tenantSpecific: false },
      { id: 'auto-sar', name: 'Auto-SAR Drafting', description: 'Automatically draft SAR reports using AI', enabled: false, rolloutPercentage: 0, tenantSpecific: false },
      { id: 'realtime-stream', name: 'Real-time Streaming', description: 'Live transaction streaming via WebSocket', enabled: true, rolloutPercentage: 100, tenantSpecific: false },
      { id: 'auto-block', name: 'Auto-Block', description: 'Automatically block high-risk transactions', enabled: false, rolloutPercentage: 0, tenantSpecific: true },
      { id: 'shadow-models', name: 'Shadow Models', description: 'Run shadow models in parallel for A/B testing', enabled: false, rolloutPercentage: 25, tenantSpecific: false },
      { id: 'advanced-analytics', name: 'Advanced Analytics', description: 'Enhanced analytics with predictive insights', enabled: true, rolloutPercentage: 100, tenantSpecific: false },
      { id: 'nlp-search', name: 'NLP Search', description: 'Natural language search across transactions and cases', enabled: false, rolloutPercentage: 10, tenantSpecific: false },
      { id: 'biometric-auth', name: 'Biometric Authentication', description: 'Fingerprint and face ID for login', enabled: false, rolloutPercentage: 0, tenantSpecific: true },
    ],
  },
  backup: {
    backupFrequency: 'daily',
    snapshotRetention: '30d',
    lastBackup: '2026-02-20T03:00:00Z',
    nextBackup: '2026-02-21T03:00:00Z',
    disasterRecoveryRegion: 'eu-west-1',
    failoverEnabled: true,
    replicationLag: 1.2,
    restorePoints: [
      { id: 'rp-1', timestamp: '2026-02-20T03:00:00Z', size: '42.3 GB', type: 'Full' },
      { id: 'rp-2', timestamp: '2026-02-19T03:00:00Z', size: '41.8 GB', type: 'Full' },
      { id: 'rp-3', timestamp: '2026-02-18T03:00:00Z', size: '41.2 GB', type: 'Full' },
      { id: 'rp-4', timestamp: '2026-02-17T03:00:00Z', size: '40.9 GB', type: 'Full' },
      { id: 'rp-5', timestamp: '2026-02-15T03:00:00Z', size: '39.7 GB', type: 'Full' },
    ],
  },
  health: {
    apiUptime: 99.97,
    dbUptime: 99.99,
    eventQueueBacklog: 127,
    avgScoringLatency: 23,
    modelInferenceTime: 45,
    cpuUsage: 34,
    memoryUsage: 62,
    diskUsage: 47,
    lastRestart: '2026-02-18T02:00:00Z',
    cacheSize: '2.4 GB',
  },
  advanced: {
    timezone: 'utc',
    dateFormat: 'ymd',
    compactView: false,
    apiEndpoint: 'https://api.snapfort.internal/v1',
    maxConcurrentJobs: 50,
    batchProcessingSize: 1000,
    telemetryEnabled: true,
    experimentalFeatures: false,
  },
};

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

let auditIdCounter = 100;
export function createAuditEntry(
  section: SettingsSectionId,
  field: string,
  oldValue: string,
  newValue: string
): AuditEntry {
  auditIdCounter++;
  return {
    id: `AUD-${auditIdCounter}`,
    section,
    action: 'settings.update',
    field,
    oldValue,
    newValue,
    user: 'John Doe (admin@bank.com)',
    timestamp: new Date().toISOString(),
  };
}
