export interface SystemStatus {
  fraudEngine: 'operational' | 'degraded' | 'down';
  dataPipeline: 'operational' | 'degraded' | 'down';
  modelStatus: 'operational' | 'degraded' | 'down';
  apiConnectivity: 'operational' | 'degraded' | 'down';
  processingLatency: number;
  activeAnalysts: number;
}

export interface EnhancedKPI {
  label: string;
  value: string | number;
  subtitle: string;
  trend: { value: number; label: string };
  details: Record<string, string | number>;
  variant: 'default' | 'success' | 'warning' | 'danger';
}

export interface ThreatEvent {
  id: string;
  type: 'large_transfer' | 'impossible_travel' | 'velocity_breach' | 'device_change' | 'geo_anomaly';
  description: string;
  amount: number;
  entity: string;
  riskScore: number;
  timestamp: string;
  country: string;
  channel: string;
}

export interface CountryRisk {
  country: string;
  code: string;
  transactions: number;
  alerts: number;
  riskScore: number;
  lossExposure: number;
  lat: number;
  lng: number;
}

export interface AIInsight {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  body: string;
  recommendations: string[];
  timestamp: string;
}

export interface AnalystPerformance {
  name: string;
  casesClosed: number;
  avgTime: number;
  escalationRate: number;
  workload: number;
}

export interface FraudNetworkNode {
  id: string;
  label: string;
  type: 'account' | 'device' | 'merchant' | 'ip';
  riskScore: number;
}

export interface FraudNetworkLink {
  source: string;
  target: string;
  type: string;
}

export interface ComplianceStatus {
  sarFiledThisMonth: number;
  sarTarget: number;
  amlAlertsToday: number;
  complianceSla: number;
  auditReadiness: number;
  nextDeadline: string;
  deadlineLabel: string;
}

export interface ModelHealthSnapshot {
  name: string;
  confidence: number;
  drift: number;
  dataFreshness: string;
  latency: number;
  precisionTrend: number[];
  recallTrend: number[];
  fpTrend: number[];
}

const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export const getSystemStatus = (): SystemStatus => ({
  fraudEngine: 'operational',
  dataPipeline: 'operational',
  modelStatus: 'operational',
  apiConnectivity: 'operational',
  processingLatency: 12,
  activeAnalysts: 8,
});

export const getEnhancedKPIs = (): EnhancedKPI[] => [
  {
    label: 'Transactions Today',
    value: '3,456',
    subtitle: '$12.6M volume',
    trend: { value: 12.5, label: 'vs yesterday' },
    details: { 'Peak hour': '2:00 PM', 'Vs baseline': '+8%', 'POS': '42%', 'Web': '28%', 'Mobile': '23%', 'ATM': '7%' },
    variant: 'default',
  },
  {
    label: 'Fraud Detection Rate',
    value: '94.5%',
    subtitle: 'ML 62% + Rules 38%',
    trend: { value: 2.3, label: 'improvement' },
    details: { 'Model contrib': '62%', 'Rule contrib': '38%', 'Drift warning': 'None', 'Confidence': '±1.8%' },
    variant: 'success',
  },
  {
    label: 'Open Alerts',
    value: '47',
    subtitle: '12 active cases',
    trend: { value: -8, label: 'vs last week' },
    details: { 'Critical': '6 (13%)', 'Workload idx': '0.78', 'SLA at risk': '3', 'Avg age': '4.2h' },
    variant: 'warning',
  },
  {
    label: 'Amount Saved',
    value: '$2.3M',
    subtitle: 'Fraud prevented this month',
    trend: { value: 15.7, label: 'vs last month' },
    details: { '30d trend': '+$340K', 'Monthly proj': '$2.8M', 'System ROI': '12.4x' },
    variant: 'success',
  },
  {
    label: 'Risk Exposure',
    value: '$4.8M',
    subtitle: 'Potential loss across open cases',
    trend: { value: 5.2, label: 'increase' },
    details: { 'High-risk txns': '234', 'Unreviewed': '89', 'Exposure trend': 'Rising' },
    variant: 'danger',
  },
  {
    label: 'Suspicious Entities',
    value: '23',
    subtitle: 'New today across all channels',
    trend: { value: -3, label: 'vs yesterday' },
    details: { 'Customers': '12', 'Merchants': '6', 'Devices': '5' },
    variant: 'warning',
  },
];

export const generateThreatEvents = (): ThreatEvent[] => {
  const types: ThreatEvent['type'][] = ['large_transfer', 'impossible_travel', 'velocity_breach', 'device_change', 'geo_anomaly'];
  const descriptions: Record<ThreatEvent['type'], string[]> = {
    large_transfer: ['Wire transfer $48,500 to offshore account', 'ACH transfer $32,000 to new beneficiary', 'Cross-border transfer $67,200 flagged'],
    impossible_travel: ['Login from London 2h after NYC session', 'ATM withdrawal in Tokyo, web login from Berlin', 'Card present in Dubai, online in Singapore'],
    velocity_breach: ['15 transactions in 8 minutes from single card', '8 wire transfers in 1 hour exceeding $200K', '12 failed auth attempts then large withdrawal'],
    device_change: ['New device + new IP + high-value transfer', 'Rooted Android device detected on premium account', 'VPN + device fingerprint mismatch on wire'],
    geo_anomaly: ['Transaction from sanctioned region (DPRK proxy)', 'Multiple accounts accessed from same Tor exit', 'High-risk corridor: Nigeria to UAE rapid transfers'],
  };
  const entities = ['ACC-78234', 'CUST-A923', 'MERCH-9912', 'ACC-44821', 'CUST-B712', 'DEV-X892', 'ACC-99123', 'CUST-C445'];
  const countries = ['US', 'UK', 'SG', 'DE', 'NG', 'AE', 'JP', 'RU'];
  const channels = ['Web', 'Mobile', 'ATM', 'Wire', 'POS'];

  const events: ThreatEvent[] = [];
  const now = Date.now();
  for (let i = 0; i < 12; i++) {
    const type = types[i % types.length];
    const descs = descriptions[type];
    events.push({
      id: `THR-${1000 + i}`,
      type,
      description: descs[i % descs.length],
      amount: randomRange(5000, 80000),
      entity: entities[i % entities.length],
      riskScore: randomRange(65, 98),
      timestamp: new Date(now - i * randomRange(60000, 600000)).toISOString(),
      country: countries[i % countries.length],
      channel: channels[i % channels.length],
    });
  }
  return events;
};

export const getCountryRisks = (): CountryRisk[] => [
  { country: 'United States', code: 'US', transactions: 145000, alerts: 890, riskScore: 42, lossExposure: 1200000, lat: 39.8, lng: -98.5 },
  { country: 'United Kingdom', code: 'UK', transactions: 67000, alerts: 420, riskScore: 38, lossExposure: 680000, lat: 55.3, lng: -3.4 },
  { country: 'Germany', code: 'DE', transactions: 43000, alerts: 180, riskScore: 28, lossExposure: 320000, lat: 51.1, lng: 10.4 },
  { country: 'Singapore', code: 'SG', transactions: 31000, alerts: 210, riskScore: 35, lossExposure: 450000, lat: 1.3, lng: 103.8 },
  { country: 'Nigeria', code: 'NG', transactions: 12000, alerts: 890, riskScore: 82, lossExposure: 980000, lat: 9.1, lng: 8.6 },
  { country: 'UAE', code: 'AE', transactions: 18000, alerts: 340, riskScore: 58, lossExposure: 560000, lat: 23.4, lng: 53.8 },
  { country: 'Russia', code: 'RU', transactions: 8900, alerts: 620, riskScore: 76, lossExposure: 890000, lat: 61.5, lng: 105.3 },
  { country: 'Japan', code: 'JP', transactions: 28000, alerts: 95, riskScore: 18, lossExposure: 120000, lat: 36.2, lng: 138.2 },
  { country: 'Brazil', code: 'BR', transactions: 22000, alerts: 380, riskScore: 55, lossExposure: 410000, lat: -14.2, lng: -51.9 },
  { country: 'India', code: 'IN', transactions: 35000, alerts: 290, riskScore: 45, lossExposure: 340000, lat: 20.5, lng: 78.9 },
];

export const getAIInsights = (): AIInsight[] => [
  {
    id: 'AI-001',
    severity: 'critical',
    title: 'Cross-border mobile fraud surge detected',
    body: 'Fraud increased 14% in cross-border mobile transactions over the last 48 hours. Primary driver: new-device payments originating from Eastern European IPs targeting US accounts.',
    recommendations: [
      'Tighten velocity rule for cross-border mobile (max 3 txns/hour)',
      'Retrain XGBoost model on last 30 days with emphasis on mobile channel',
      'Increase monitoring threshold for mobile channel to 0.45',
      'Alert APAC team for manual review of flagged accounts',
    ],
    timestamp: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'AI-002',
    severity: 'high',
    title: 'Merchant risk cluster forming in crypto exchanges',
    body: 'Three crypto exchange merchants showing correlated suspicious patterns: rapid small deposits followed by large withdrawals. Potential layering behavior detected across 45 accounts.',
    recommendations: [
      'Escalate MERCH-9912, MERCH-8823, MERCH-7741 to AML team',
      'File preliminary SAR for accounts with >$10K aggregate transfers',
      'Apply enhanced due diligence on crypto merchant category',
    ],
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'AI-003',
    severity: 'medium',
    title: 'Model precision declining on ATM channel',
    body: 'ATM channel precision dropped from 89% to 83% over the past week. Root cause: seasonal shift in withdrawal patterns near holiday period causing elevated false positives.',
    recommendations: [
      'Adjust ATM threshold from 0.55 to 0.62 temporarily',
      'Schedule model retraining with updated seasonal features',
      'Review top 20 ATM false positives for pattern refinement',
    ],
    timestamp: new Date(Date.now() - 7200000).toISOString(),
  },
];

export const getTransactionChannelBreakdown = () => [
  { channel: 'POS', volume: 1452, pct: 42, fraud: 23, color: 'hsl(var(--primary))' },
  { channel: 'Web', volume: 968, pct: 28, fraud: 31, color: 'hsl(var(--chart-2))' },
  { channel: 'Mobile', volume: 795, pct: 23, fraud: 18, color: 'hsl(var(--chart-3))' },
  { channel: 'ATM', volume: 241, pct: 7, fraud: 8, color: 'hsl(var(--chart-4))' },
];

export const getEnhancedFraudTrend = () => {
  const data = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const actual = +(2.8 + Math.random() * 1.5 + (i < 5 ? 0.8 : 0)).toFixed(2);
    const expected = +(3.0 + Math.sin(i / 7) * 0.3).toFixed(2);
    const prediction = i < 3 ? +(actual + (Math.random() * 0.4 - 0.2)).toFixed(2) : null;
    data.push({
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      actual,
      expected,
      prediction,
      isAnomaly: actual > expected + 0.8,
    });
  }
  return data;
};

export const getRiskPyramid = () => [
  { tier: 'Critical', count: 34, exposure: 1890000, pct: 3.5 },
  { tier: 'High', count: 118, exposure: 2340000, pct: 11.8 },
  { tier: 'Medium', count: 223, exposure: 890000, pct: 22.3 },
  { tier: 'Low', count: 624, exposure: 210000, pct: 62.4 },
];

export const getAnalystPerformance = (): AnalystPerformance[] => [
  { name: 'Sarah Chen', casesClosed: 34, avgTime: 2.8, escalationRate: 0.12, workload: 0.85 },
  { name: 'Michael Torres', casesClosed: 28, avgTime: 3.5, escalationRate: 0.18, workload: 0.92 },
  { name: 'David Kim', casesClosed: 31, avgTime: 3.1, escalationRate: 0.09, workload: 0.78 },
  { name: 'Priya Patel', casesClosed: 22, avgTime: 4.2, escalationRate: 0.22, workload: 0.95 },
  { name: 'James Walker', casesClosed: 26, avgTime: 3.8, escalationRate: 0.15, workload: 0.68 },
  { name: 'Elena Rodriguez', casesClosed: 19, avgTime: 5.1, escalationRate: 0.28, workload: 0.88 },
];

export const getFraudNetworkSnapshot = (): { nodes: FraudNetworkNode[]; links: FraudNetworkLink[] } => ({
  nodes: [
    { id: 'A1', label: 'ACC-78234', type: 'account', riskScore: 88 },
    { id: 'A2', label: 'ACC-44821', type: 'account', riskScore: 75 },
    { id: 'A3', label: 'ACC-99123', type: 'account', riskScore: 82 },
    { id: 'D1', label: 'DEV-X892', type: 'device', riskScore: 91 },
    { id: 'M1', label: 'MERCH-9912', type: 'merchant', riskScore: 78 },
    { id: 'IP1', label: '185.23.x.x', type: 'ip', riskScore: 85 },
    { id: 'A4', label: 'ACC-55612', type: 'account', riskScore: 68 },
    { id: 'D2', label: 'DEV-Y443', type: 'device', riskScore: 72 },
  ],
  links: [
    { source: 'A1', target: 'D1', type: 'uses_device' },
    { source: 'A2', target: 'D1', type: 'uses_device' },
    { source: 'A3', target: 'D1', type: 'uses_device' },
    { source: 'A1', target: 'M1', type: 'transacts_with' },
    { source: 'A2', target: 'M1', type: 'transacts_with' },
    { source: 'A1', target: 'IP1', type: 'from_ip' },
    { source: 'A3', target: 'IP1', type: 'from_ip' },
    { source: 'A4', target: 'D2', type: 'uses_device' },
    { source: 'A4', target: 'M1', type: 'transacts_with' },
    { source: 'D2', target: 'IP1', type: 'from_ip' },
  ],
});

export const getModelHealthSnapshot = (): ModelHealthSnapshot => ({
  name: 'XGBoost v2.3.1',
  confidence: 0.91,
  drift: 0.06,
  dataFreshness: '12 min ago',
  latency: 35,
  precisionTrend: [0.88, 0.89, 0.90, 0.91, 0.91, 0.90, 0.91, 0.89, 0.91, 0.91, 0.90, 0.91],
  recallTrend: [0.84, 0.85, 0.85, 0.86, 0.87, 0.86, 0.87, 0.86, 0.87, 0.87, 0.86, 0.87],
  fpTrend: [0.042, 0.038, 0.035, 0.033, 0.032, 0.034, 0.031, 0.033, 0.030, 0.031, 0.032, 0.030],
});

export const getComplianceStatus = (): ComplianceStatus => ({
  sarFiledThisMonth: 14,
  sarTarget: 20,
  amlAlertsToday: 23,
  complianceSla: 96.5,
  auditReadiness: 88,
  nextDeadline: '2025-03-15',
  deadlineLabel: 'Quarterly SAR Report',
});

export const getEnhancedTransactionVolume = () => {
  const data = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    data.push({
      label: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      total: randomRange(2800, 4200),
      pos: randomRange(1100, 1800),
      web: randomRange(700, 1200),
      mobile: randomRange(600, 1000),
      atm: randomRange(150, 350),
      fraudMarkers: randomRange(0, 3),
    });
  }
  return data;
};
