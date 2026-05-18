import { useState, useMemo, useEffect } from 'react';
import {
  Activity, AlertTriangle, DollarSign, Shield, Clock,
  TrendingUp, TrendingDown, Brain, Users, ChevronRight,
  Globe, Zap, Eye, BarChart3, Target, ArrowUpRight,
  Cpu, Radio, FileText, CheckCircle2, XCircle,
  Smartphone, Monitor, CreditCard, Landmark,
  ChevronDown, ChevronUp, Minus, Link as LinkIcon, ShieldCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { StatCard } from '@/components/dashboard/StatCard';
import { LiveTransactionFeed } from '@/components/dashboard/LiveTransactionFeed';
import { RecentAlerts } from '@/components/dashboard/RecentAlerts';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Legend, Tooltip as RTooltip, Cell, PieChart, Pie,
} from 'recharts';
import {
  useDashboardKpisQuery, useDashboardTrendsQuery, useComplianceSnapshotQuery,
} from '@/hooks/use-dashboard-api';
import { formatDistanceToNow } from 'date-fns';

// ----- UI-scaffolding types & static fallbacks -------------------------------
// Numeric rollups (KPIs / trends / compliance snapshot) are sourced live from
// /api/dashboard/*. The presentational scaffolding below (system pills, AI
// insight cards, fraud-network mini-graph, model-health snapshot, compliance
// status badges, threat list, country list, analyst list) remains static for
// now and is migrated to live endpoints in follow-up #27.

interface SystemStatus {
  fraudEngine: 'operational' | 'degraded' | 'down';
  dataPipeline: 'operational' | 'degraded' | 'down';
  modelStatus: 'operational' | 'degraded' | 'down';
  apiConnectivity: 'operational' | 'degraded' | 'down';
  processingLatency: number;
  activeAnalysts: number;
}
interface ThreatEvent {
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
interface CountryRisk {
  country: string; code: string; transactions: number; alerts: number;
  riskScore: number; lossExposure: number; lat: number; lng: number;
}
interface AIInsight {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  body: string;
  recommendations: string[];
  timestamp: string;
}
interface AnalystPerformance {
  name: string; casesClosed: number; avgTime: number; escalationRate: number; workload: number;
}
interface FraudNetworkNode { id: string; label: string; type: 'account' | 'device' | 'merchant' | 'ip'; riskScore: number; }
interface FraudNetworkLink { source: string; target: string; type: string; }
interface ComplianceStatus {
  sarFiledThisMonth: number; sarTarget: number; amlAlertsToday: number;
  complianceSla: number; auditReadiness: number; nextDeadline: string; deadlineLabel: string;
}
interface ModelHealthSnapshot {
  name: string; confidence: number; drift: number; dataFreshness: string; latency: number;
  precisionTrend: number[]; recallTrend: number[]; fpTrend: number[];
}

const randomRange = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const STATIC_SYSTEM_STATUS: SystemStatus = {
  fraudEngine: 'operational', dataPipeline: 'operational', modelStatus: 'operational',
  apiConnectivity: 'operational', processingLatency: 12, activeAnalysts: 8,
};

const generateThreatEvents = (): ThreatEvent[] => {
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
      id: `THR-${1000 + i}`, type, description: descs[i % descs.length],
      amount: randomRange(5000, 80000), entity: entities[i % entities.length],
      riskScore: randomRange(65, 98),
      timestamp: new Date(now - i * randomRange(60000, 600000)).toISOString(),
      country: countries[i % countries.length], channel: channels[i % channels.length],
    });
  }
  return events;
};

const STATIC_COUNTRY_RISKS: CountryRisk[] = [
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

const STATIC_AI_INSIGHTS: AIInsight[] = [
  {
    id: 'AI-001', severity: 'critical',
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
    id: 'AI-002', severity: 'high',
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
    id: 'AI-003', severity: 'medium',
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

const STATIC_ANALYSTS: AnalystPerformance[] = [
  { name: 'Sarah Chen',      casesClosed: 34, avgTime: 2.8, escalationRate: 0.12, workload: 0.85 },
  { name: 'Michael Torres',  casesClosed: 28, avgTime: 3.5, escalationRate: 0.18, workload: 0.92 },
  { name: 'David Kim',       casesClosed: 31, avgTime: 3.1, escalationRate: 0.09, workload: 0.78 },
  { name: 'Priya Patel',     casesClosed: 22, avgTime: 4.2, escalationRate: 0.22, workload: 0.95 },
  { name: 'James Walker',    casesClosed: 26, avgTime: 3.8, escalationRate: 0.15, workload: 0.68 },
  { name: 'Elena Rodriguez', casesClosed: 19, avgTime: 5.1, escalationRate: 0.28, workload: 0.88 },
];

const STATIC_FRAUD_NETWORK: { nodes: FraudNetworkNode[]; links: FraudNetworkLink[] } = {
  nodes: [
    { id: 'A1', label: 'ACC-78234', type: 'account',  riskScore: 88 },
    { id: 'A2', label: 'ACC-44821', type: 'account',  riskScore: 75 },
    { id: 'A3', label: 'ACC-99123', type: 'account',  riskScore: 82 },
    { id: 'D1', label: 'DEV-X892',  type: 'device',   riskScore: 91 },
    { id: 'M1', label: 'MERCH-9912', type: 'merchant', riskScore: 78 },
    { id: 'IP1', label: '185.23.x.x', type: 'ip',     riskScore: 85 },
    { id: 'A4', label: 'ACC-55612', type: 'account',  riskScore: 68 },
    { id: 'D2', label: 'DEV-Y443',  type: 'device',   riskScore: 72 },
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
};

const STATIC_MODEL_HEALTH: ModelHealthSnapshot = {
  name: 'XGBoost v2.3.1', confidence: 0.91, drift: 0.06, dataFreshness: '12 min ago', latency: 35,
  precisionTrend: [0.88, 0.89, 0.90, 0.91, 0.91, 0.90, 0.91, 0.89, 0.91, 0.91, 0.90, 0.91],
  recallTrend:    [0.84, 0.85, 0.85, 0.86, 0.87, 0.86, 0.87, 0.86, 0.87, 0.87, 0.86, 0.87],
  fpTrend:        [0.042, 0.038, 0.035, 0.033, 0.032, 0.034, 0.031, 0.033, 0.030, 0.031, 0.032, 0.030],
};

const STATIC_COMPLIANCE_STATUS: ComplianceStatus = {
  sarFiledThisMonth: 14, sarTarget: 20, amlAlertsToday: 23,
  complianceSla: 96.5, auditReadiness: 88,
  nextDeadline: '2025-03-15', deadlineLabel: 'Quarterly SAR Report',
};
// ----- end UI scaffolding ----------------------------------------------------

const EMPTY_COMPLIANCE = {
  verifiedCustomers: 0, unverifiedCustomers: 0, highRiskCustomers: 0,
  pepMatches: 0, sanctionsMatches: 0, strSubmittedThisMonth: 0,
  strPending: 0, strOverdue: 0, ctrFlags: 0, fraudLossYtd: 0,
  fraudPreventedYtd: 0, eddOpen: 0, eddOverdue: 0,
};
const EMPTY_PYRAMID = [
  { tier: 'Critical', count: 0, exposure: 0, pct: 0 },
  { tier: 'High',     count: 0, exposure: 0, pct: 0 },
  { tier: 'Medium',   count: 0, exposure: 0, pct: 0 },
  { tier: 'Low',      count: 0, exposure: 0, pct: 0 },
] as const;

function AnomalyDot(props: any) {
  const { cx, cy, payload, key: _key, dataKey, ...rest } = props;
  if (!cx || !cy) return null;
  if (payload?.isAnomaly) {
    return <circle cx={cx} cy={cy} r={5} fill="hsl(var(--destructive))" stroke="white" strokeWidth={2} {...rest} />;
  }
  return null;
}

const statusColor = (s: string) => s === 'operational' ? 'bg-emerald-500' : s === 'degraded' ? 'bg-amber-500' : 'bg-red-500';
const statusLabel = (s: string) => s === 'operational' ? 'Healthy' : s === 'degraded' ? 'Degraded' : 'Down';

const threatIcon = (type: ThreatEvent['type']) => {
  switch (type) {
    case 'large_transfer': return <DollarSign className="h-3.5 w-3.5" />;
    case 'impossible_travel': return <Globe className="h-3.5 w-3.5" />;
    case 'velocity_breach': return <Zap className="h-3.5 w-3.5" />;
    case 'device_change': return <Smartphone className="h-3.5 w-3.5" />;
    case 'geo_anomaly': return <Target className="h-3.5 w-3.5" />;
  }
};

const threatColor = (type: ThreatEvent['type']) => {
  switch (type) {
    case 'large_transfer': return 'text-amber-500 bg-amber-500/10';
    case 'impossible_travel': return 'text-red-500 bg-red-500/10';
    case 'velocity_breach': return 'text-orange-500 bg-orange-500/10';
    case 'device_change': return 'text-blue-500 bg-blue-500/10';
    case 'geo_anomaly': return 'text-purple-500 bg-purple-500/10';
  }
};

const severityColor = (s: AIInsight['severity']) => {
  switch (s) {
    case 'critical': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'high': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    case 'medium': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'info': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
  }
};

export default function Dashboard() {
  const systemStatus = STATIC_SYSTEM_STATUS;
  const kpisQuery = useDashboardKpisQuery();
  const trendsQuery = useDashboardTrendsQuery('7d');
  const complianceSnapshotQuery = useComplianceSnapshotQuery();

  const kpis = kpisQuery.data?.cards ?? [];
  const riskPyramid = kpisQuery.data?.riskPyramid ?? EMPTY_PYRAMID;
  const channelBreakdown = trendsQuery.data?.channelBreakdown ?? [];
  const txnVolume = trendsQuery.data?.txnVolume7d ?? [];
  const fraudTrend = (trendsQuery.data?.fraudTrend30d ?? []).map(p => ({
    ...p,
    date: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }));
  const complianceKpis = complianceSnapshotQuery.data ?? EMPTY_COMPLIANCE;

  const threats = useMemo(() => generateThreatEvents(), []);
  const countryRisks = STATIC_COUNTRY_RISKS;
  const aiInsights = STATIC_AI_INSIGHTS;
  const analysts = STATIC_ANALYSTS;
  const fraudNetwork = STATIC_FRAUD_NETWORK;
  const modelHealth = STATIC_MODEL_HEALTH;
  const compliance = STATIC_COMPLIANCE_STATUS;

  const [currentTime, setCurrentTime] = useState(new Date());
  const [expandedKpi, setExpandedKpi] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const pyramidColors = ['hsl(var(--risk-critical))', 'hsl(var(--risk-high))', 'hsl(var(--risk-medium))', 'hsl(var(--risk-low))'];

  const networkNodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const cx = 160, cy = 100;
    fraudNetwork.nodes.forEach((node, i) => {
      const angle = (i / fraudNetwork.nodes.length) * 2 * Math.PI - Math.PI / 2;
      const r = 65 + (i % 2) * 20;
      positions[node.id] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });
    return positions;
  }, [fraudNetwork]);

  const nodeColor = (type: string) => {
    switch (type) {
      case 'account': return '#3b82f6';
      case 'device': return '#ef4444';
      case 'merchant': return '#f59e0b';
      case 'ip': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const modelTrendData = modelHealth.precisionTrend.map((p, i) => ({
    week: `W${i + 1}`,
    precision: +(p * 100).toFixed(1),
    recall: +(modelHealth.recallTrend[i] * 100).toFixed(1),
    fp: +(modelHealth.fpTrend[i] * 100).toFixed(1),
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 1. GLOBAL COMMAND HEADER */}
      <section data-testid="section-command-header">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
              <Radio className="h-6 w-6 text-primary" />
              Fraud Command Center
            </h1>
            <p className="text-sm text-muted-foreground">Real-time fraud detection and AML monitoring intelligence</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <TooltipProvider>
              {[
                { label: 'Fraud Engine', status: systemStatus.fraudEngine },
                { label: 'Data Pipeline', status: systemStatus.dataPipeline },
                { label: 'Model Status', status: systemStatus.modelStatus },
                { label: 'API', status: systemStatus.apiConnectivity },
              ].map((sys) => (
                <Tooltip key={sys.label}>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-default" data-testid={`status-${sys.label.toLowerCase().replace(/\s/g, '-')}`}>
                      <div className={cn('h-2 w-2 rounded-full', statusColor(sys.status))} />
                      <span className="text-xs text-muted-foreground hidden sm:inline">{sys.label}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent><p className="text-xs">{sys.label}: {statusLabel(sys.status)}</p></TooltipContent>
                </Tooltip>
              ))}
            </TooltipProvider>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {currentTime.toLocaleTimeString()}
            </div>
            <Badge variant="outline" className="text-xs">
              <span className="mr-1">{systemStatus.processingLatency}ms</span>latency
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Users className="h-3 w-3 mr-1" />{systemStatus.activeAnalysts} analysts
            </Badge>
            <Link to="/ai-assistant">
              <Button size="sm" variant="outline" data-testid="button-ai-assistant">
                <Brain className="h-4 w-4 mr-1" /> AI Assistant
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 2. ENHANCED KPIs */}
      <section data-testid="section-kpis">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {kpisQuery.isLoading && kpis.length === 0 ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="stat-card animate-pulse" data-testid={`kpi-skeleton-${i}`}>
                <div className="h-3 w-20 rounded bg-muted mb-2" />
                <div className="h-7 w-16 rounded bg-muted mb-2" />
                <div className="h-2 w-24 rounded bg-muted/70" />
              </div>
            ))
          ) : kpis.map((kpi, i) => (
            <div
              key={kpi.label}
              className={cn(
                'stat-card cursor-pointer transition-all',
                kpi.variant === 'success' && 'border-success/30 bg-gradient-to-br from-success/5 to-transparent',
                kpi.variant === 'warning' && 'border-warning/30 bg-gradient-to-br from-warning/5 to-transparent',
                kpi.variant === 'danger' && 'border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent',
                expandedKpi === i && 'ring-1 ring-primary/30',
              )}
              onClick={() => setExpandedKpi(expandedKpi === i ? null : i)}
              data-testid={`kpi-card-${i}`}
            >
              <div className="flex items-start justify-between mb-1">
                <p className="text-xs font-medium text-muted-foreground">{kpi.label}</p>
                {expandedKpi === i ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
              </div>
              <p className="text-2xl font-bold tracking-tight">{kpi.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.subtitle}</p>
              <div className={cn('flex items-center gap-1 text-[10px] font-medium mt-1',
                kpi.trend.value > 0 ? 'text-emerald-600' : kpi.trend.value < 0 ? 'text-red-500' : 'text-muted-foreground'
              )}>
                {kpi.trend.value > 0 ? <TrendingUp className="h-3 w-3" /> : kpi.trend.value < 0 ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                {Math.abs(kpi.trend.value)}% {kpi.trend.label}
              </div>
              {expandedKpi === i && (
                <div className="mt-3 pt-2 border-t border-border space-y-1 animate-fade-in">
                  {Object.entries(kpi.details).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">{k}</span>
                      <span className="font-medium">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 2b. COMPLIANCE SNAPSHOT */}
      <section data-testid="section-compliance-snapshot">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Compliance Snapshot
            <span className="text-[10px] text-muted-foreground font-normal">CBN / NFIU</span>
          </h2>
          <span className="text-[10px] text-muted-foreground">
            {complianceSnapshotQuery.isLoading && !complianceSnapshotQuery.data ? 'Loading…' : 'Live'}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Verified Customers', value: complianceKpis.verifiedCustomers.toLocaleString(), sub: `${complianceKpis.unverifiedCustomers} unverified`, accent: 'text-emerald-600', bar: 'bg-emerald-500/15' },
            { label: 'High-Risk Customers', value: complianceKpis.highRiskCustomers.toLocaleString(), sub: `${complianceKpis.eddOpen} EDD open`, accent: 'text-destructive', bar: 'bg-destructive/15' },
            { label: 'PEP Matches', value: complianceKpis.pepMatches.toLocaleString(), sub: 'Politically exposed', accent: 'text-amber-600', bar: 'bg-amber-500/15' },
            { label: 'Sanctions Matches', value: complianceKpis.sanctionsMatches.toLocaleString(), sub: 'OFAC/UN/EU', accent: 'text-destructive', bar: 'bg-destructive/15' },
            { label: 'STR Submitted', value: complianceKpis.strSubmittedThisMonth.toLocaleString(), sub: `${complianceKpis.strOverdue} overdue`, accent: complianceKpis.strOverdue > 0 ? 'text-destructive' : 'text-primary', bar: 'bg-primary/15' },
            { label: 'Fraud Loss vs Prevented', value: `₦${(complianceKpis.fraudLossYtd / 1_000_000).toFixed(1)}M`, sub: `Saved ₦${(complianceKpis.fraudPreventedYtd / 1_000_000).toFixed(1)}M`, accent: 'text-rose-600', bar: 'bg-rose-500/15' },
          ].map((c, i) => (
            <div key={i} className="stat-card hover-elevate cursor-default" data-testid={`compliance-kpi-${i}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('h-1.5 w-1.5 rounded-full', c.bar.replace('/15', ''))} />
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">{c.label}</p>
              </div>
              <p className={cn('text-xl font-bold tracking-tight', c.accent)}>{c.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{c.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. REAL-TIME SITUATIONAL AWARENESS */}
      <section data-testid="section-situational-awareness">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Live Threat Monitor */}
          <div className="lg:col-span-2 stat-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4 text-destructive" />
                Live Threat Monitor
              </h3>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-[10px] text-destructive font-medium">LIVE</span>
              </div>
            </div>
            <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
              {threats.map((event, i) => (
                <div
                  key={event.id}
                  className={cn(
                    'flex items-start gap-2 p-2.5 rounded-lg border border-border/50 hover:bg-muted/50 transition-colors cursor-pointer group',
                    i === 0 && 'border-destructive/30 bg-destructive/5 animate-slide-up'
                  )}
                  data-testid={`threat-event-${event.id}`}
                >
                  <div className={cn('p-1.5 rounded', threatColor(event.type))}>
                    {threatIcon(event.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium leading-tight">{event.description}</p>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span>{event.entity}</span>
                      <span>{event.channel}</span>
                      <span>{event.country}</span>
                      <span>${event.amount.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <Badge variant="outline" className={cn('text-[9px]',
                      event.riskScore >= 85 ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                      event.riskScore >= 70 ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' :
                      'bg-amber-500/10 text-amber-600 border-amber-500/20'
                    )}>{event.riskScore}</Badge>
                    <span className="text-[9px] text-muted-foreground">
                      {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Global Risk Map (table-based) */}
          <div className="lg:col-span-3 stat-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                Global Risk Distribution
              </h3>
              <Badge variant="outline" className="text-[10px]">10 countries</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="table-country-risk">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 font-medium text-muted-foreground">Country</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Txns</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Alerts</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Risk</th>
                    <th className="text-right py-2 font-medium text-muted-foreground">Exposure</th>
                    <th className="py-2 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {countryRisks.sort((a, b) => b.riskScore - a.riskScore).map((c) => (
                    <tr key={c.code} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-1.5 font-medium">{c.country}</td>
                      <td className="text-right py-1.5 text-muted-foreground">{(c.transactions / 1000).toFixed(0)}K</td>
                      <td className="text-right py-1.5">{c.alerts}</td>
                      <td className="text-right py-1.5">
                        <span className={cn('font-mono font-medium',
                          c.riskScore >= 70 ? 'text-red-500' :
                          c.riskScore >= 50 ? 'text-orange-500' :
                          c.riskScore >= 30 ? 'text-amber-500' : 'text-emerald-600'
                        )}>{c.riskScore}</span>
                      </td>
                      <td className="text-right py-1.5 text-muted-foreground">${(c.lossExposure / 1000).toFixed(0)}K</td>
                      <td className="py-1.5">
                        <Progress value={c.riskScore} className={cn('h-1.5',
                          c.riskScore >= 70 ? '[&>div]:bg-red-500' :
                          c.riskScore >= 50 ? '[&>div]:bg-orange-500' :
                          c.riskScore >= 30 ? '[&>div]:bg-amber-500' : ''
                        )} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* 4. INTELLIGENT TREND ANALYTICS */}
      <section data-testid="section-trend-analytics">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> Intelligent Trend Analytics
          {trendsQuery.isLoading && !trendsQuery.data && (
            <span className="text-[10px] font-normal text-muted-foreground" data-testid="text-trends-loading">Loading…</span>
          )}
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Transaction Volume with channels */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Transaction Volume (7d)</h4>
              <div className="flex gap-1.5">
                {channelBreakdown.map((ch) => (
                  <Badge key={ch.channel} variant="outline" className="text-[9px]">{ch.channel} {ch.pct}%</Badge>
                ))}
              </div>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={txnVolume} margin={{ left: -10, right: 5, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
                  <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 11 }} />
                  <Bar dataKey="pos" stackId="a" fill="hsl(var(--primary))" name="POS" />
                  <Bar dataKey="web" stackId="a" fill="hsl(var(--chart-2))" name="Web" />
                  <Bar dataKey="mobile" stackId="a" fill="hsl(var(--chart-3))" name="Mobile" />
                  <Bar dataKey="atm" stackId="a" fill="hsl(var(--chart-4))" name="ATM" radius={[4, 4, 0, 0]} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fraud Trend with anomaly + prediction */}
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Fraud Trend Analysis (30d)</h4>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] text-muted-foreground">Anomaly detected</span>
              </div>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={fraudTrend} margin={{ left: -10, right: 5, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} interval={4} />
                  <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} domain={['auto', 'auto']} />
                  <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 11 }} />
                  <Line type="monotone" dataKey="expected" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" strokeWidth={1.5} dot={false} name="Expected" />
                  <Line type="monotone" dataKey="actual" stroke="hsl(var(--destructive))" strokeWidth={2} dot={<AnomalyDot />} name="Actual %" />
                  <Line type="monotone" dataKey="prediction" stroke="hsl(var(--primary))" strokeDasharray="3 3" strokeWidth={1.5} dot={false} name="Prediction" />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Risk Pyramid */}
          <div className="stat-card">
            <h4 className="text-sm font-medium mb-3">Risk Distribution Pyramid</h4>
            <div className="flex flex-col items-center gap-2 py-4">
              {riskPyramid.map((tier, i) => {
                const widthPct = 30 + i * 20;
                return (
                  <TooltipProvider key={tier.tier}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="flex items-center justify-center rounded py-2.5 transition-all hover:opacity-80 cursor-default"
                          style={{ width: `${widthPct}%`, backgroundColor: pyramidColors[i], opacity: 0.85 }}
                          data-testid={`pyramid-${tier.tier.toLowerCase()}`}
                        >
                          <span className="text-xs font-bold text-white drop-shadow">{tier.tier}</span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-0.5">
                          <p className="font-medium">{tier.tier} Risk</p>
                          <p>{tier.count} entities ({tier.pct}%)</p>
                          <p>Exposure: ${(tier.exposure / 1000).toFixed(0)}K</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </div>
            <div className="grid grid-cols-4 gap-1 text-center mt-2 pt-2 border-t border-border">
              {riskPyramid.map((tier) => (
                <div key={tier.tier}>
                  <p className="text-lg font-bold">{tier.count}</p>
                  <p className="text-[9px] text-muted-foreground">{tier.tier}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. AI FRAUD INSIGHTS */}
      <section data-testid="section-ai-insights">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" /> AI Fraud Insights
          </h2>
          <Link to="/ai-assistant">
            <Button variant="ghost" size="sm" className="text-xs" data-testid="link-ai-assistant">
              Open AI Assistant <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {aiInsights.map((insight) => (
            <div key={insight.id} className={cn('stat-card border-l-4', severityColor(insight.severity).replace('bg-', 'border-l-').replace('/10', ''))} data-testid={`ai-insight-${insight.id}`}>
              <div className="flex items-start justify-between mb-2">
                <Badge variant="outline" className={cn('text-[10px]', severityColor(insight.severity))}>
                  {insight.severity.toUpperCase()}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(insight.timestamp), { addSuffix: true })}
                </span>
              </div>
              <h4 className="text-sm font-semibold mb-2">{insight.title}</h4>
              <p className="text-xs text-muted-foreground leading-relaxed mb-3">{insight.body}</p>
              <div className="border-t border-border pt-2">
                <p className="text-[10px] font-medium text-muted-foreground mb-1.5">Recommended Actions:</p>
                <ul className="space-y-1">
                  {insight.recommendations.map((rec, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
                      <ChevronRight className="h-3 w-3 mt-0.5 text-primary flex-shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6. INVESTIGATOR OPERATIONS CENTER */}
      <section data-testid="section-operations">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Eye className="h-5 w-5 text-primary" /> Investigator Operations
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          <LiveTransactionFeed />
          <RecentAlerts />
          {/* Top Risky Entities */}
          <div className="stat-card">
            <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4" />
              Top Risky Entities
            </h3>
            <div className="space-y-3">
              {[
                { category: 'Merchants', items: [{ name: 'Casino Royale', score: 78 }, { name: 'Crypto Exchange X', score: 72 }, { name: 'Money Transfer Co', score: 68 }] },
                { category: 'Customers', items: [{ name: 'ACC-78234', score: 88 }, { name: 'ACC-44821', score: 75 }, { name: 'ACC-99123', score: 82 }] },
                { category: 'Devices', items: [{ name: 'DEV-X892 (Rooted)', score: 91 }, { name: 'DEV-Y443 (VPN)', score: 72 }] },
              ].map((group) => (
                <div key={group.category}>
                  <p className="text-[10px] font-medium text-muted-foreground mb-1">{group.category}</p>
                  {group.items.map((item) => (
                    <div key={item.name} className="flex items-center justify-between py-1">
                      <span className="text-xs truncate">{item.name}</span>
                      <Badge variant="outline" className={cn('text-[9px] font-mono',
                        item.score >= 80 ? 'bg-red-500/10 text-red-600 border-red-500/20' :
                        item.score >= 60 ? 'bg-orange-500/10 text-orange-600 border-orange-500/20' :
                        'bg-amber-500/10 text-amber-600 border-amber-500/20'
                      )}>{item.score}</Badge>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 7. MODEL HEALTH + 8. ANALYST PERFORMANCE + 9. FRAUD NETWORK + 10. COMPLIANCE */}
      <section data-testid="section-bottom-panels">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
          {/* Model Health */}
          <div className="stat-card" data-testid="panel-model-health">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" /> Model Health
              </h3>
              <Link to="/models">
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2">Details <ChevronRight className="h-3 w-3 ml-0.5" /></Button>
              </Link>
            </div>
            <div className="space-y-2 mb-3">
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">{modelHealth.name}</span><Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600">Healthy</Badge></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Confidence</span><span className="font-mono font-medium">{(modelHealth.confidence * 100).toFixed(0)}%</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Drift (PSI)</span><span className="font-mono">{modelHealth.drift.toFixed(2)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Data freshness</span><span>{modelHealth.dataFreshness}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Latency p95</span><span className="font-mono">{modelHealth.latency}ms</span></div>
            </div>
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={modelTrendData} margin={{ left: -15, right: 5, top: 5, bottom: 5 }}>
                  <XAxis dataKey="week" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} domain={[80, 95]} />
                  <Line type="monotone" dataKey="precision" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} name="Precision" />
                  <Line type="monotone" dataKey="recall" stroke="hsl(var(--chart-3))" strokeWidth={1.5} dot={false} name="Recall" />
                  <Legend iconSize={6} wrapperStyle={{ fontSize: 9 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Analyst Performance */}
          <div className="stat-card" data-testid="panel-analyst-performance">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Analyst Performance
              </h3>
            </div>
            <div className="space-y-2">
              {analysts.slice(0, 5).map((analyst) => (
                <div key={analyst.name} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate">{analyst.name}</span>
                      <span className="text-[10px] text-muted-foreground">{analyst.casesClosed} cases</span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Progress value={analyst.workload * 100} className={cn('h-1.5 flex-1',
                        analyst.workload > 0.9 ? '[&>div]:bg-red-500' :
                        analyst.workload > 0.8 ? '[&>div]:bg-amber-500' : ''
                      )} />
                      <span className="text-[9px] text-muted-foreground w-8">{(analyst.workload * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-border text-[10px] text-muted-foreground">
              <span>Avg resolution: 3.6h</span>
              <span>Escalation rate: 17%</span>
            </div>
          </div>

          {/* Fraud Network Snapshot */}
          <div className="stat-card" data-testid="panel-fraud-network">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-primary" /> Fraud Network
              </h3>
              <Link to="/graph">
                <Button variant="ghost" size="sm" className="text-[10px] h-6 px-2">Expand <ChevronRight className="h-3 w-3 ml-0.5" /></Button>
              </Link>
            </div>
            <svg viewBox="0 0 320 200" className="w-full h-[180px]">
              {fraudNetwork.links.map((link, i) => {
                const s = networkNodePositions[link.source];
                const t = networkNodePositions[link.target];
                if (!s || !t) return null;
                return <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="hsl(var(--border))" strokeWidth={1} opacity={0.6} />;
              })}
              {fraudNetwork.nodes.map((node) => {
                const pos = networkNodePositions[node.id];
                if (!pos) return null;
                return (
                  <g key={node.id}>
                    <circle cx={pos.x} cy={pos.y} r={node.riskScore > 80 ? 10 : 7} fill={nodeColor(node.type)} opacity={0.8} />
                    <text x={pos.x} y={pos.y + (node.riskScore > 80 ? 20 : 16)} textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize={8}>{node.label}</text>
                  </g>
                );
              })}
            </svg>
            <div className="flex items-center justify-center gap-3 text-[9px] text-muted-foreground mt-1">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} /> Account</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#ef4444' }} /> Device</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#f59e0b' }} /> Merchant</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: '#8b5cf6' }} /> IP</span>
            </div>
          </div>

          {/* Compliance Status */}
          <div className="stat-card" data-testid="panel-compliance">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Compliance Status
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">SAR Filings</span>
                  <span className="font-medium">{compliance.sarFiledThisMonth}/{compliance.sarTarget}</span>
                </div>
                <Progress value={(compliance.sarFiledThisMonth / compliance.sarTarget) * 100} className="h-2" />
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">AML Alerts Today</span>
                <span className="font-medium">{compliance.amlAlertsToday}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Compliance SLA</span>
                <span className={cn('font-medium', compliance.complianceSla >= 95 ? 'text-emerald-600' : 'text-amber-500')}>{compliance.complianceSla}%</span>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">Audit Readiness</span>
                  <span className="font-medium">{compliance.auditReadiness}%</span>
                </div>
                <Progress value={compliance.auditReadiness} className={cn('h-2', compliance.auditReadiness < 90 ? '[&>div]:bg-amber-500' : '')} />
              </div>
              <div className="pt-2 border-t border-border">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Next deadline</span>
                  <span className="font-medium">{compliance.deadlineLabel}</span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(compliance.nextDeadline).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
