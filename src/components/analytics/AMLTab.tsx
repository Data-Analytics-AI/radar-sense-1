import { useState } from 'react';
import type { AnalyticsData } from '@/lib/analytics-data';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { Info, ChevronRight, AlertTriangle, Clock, FileText, Shield, Landmark, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AMLTabProps {
  data: AnalyticsData['aml'];
}

const chartTooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' };

type DrawerState = { open: boolean; title: string; subtitle?: string; definition?: string; sections?: { label: string; value: string | number; highlight?: boolean }[]; breakdown?: { label: string; value: number; total?: number }[]; actions?: { label: string; linkTo?: string; variant?: 'default' | 'outline' }[] };

const kpiConfig = [
  { key: 'alertCount' as const, title: 'AML Alerts', icon: <AlertTriangle className="h-4 w-4" /> },
  { key: 'escalations' as const, title: 'Escalations', icon: <Shield className="h-4 w-4" /> },
  { key: 'sarsFiled' as const, title: 'SARs Filed', icon: <FileText className="h-4 w-4" /> },
  { key: 'avgEscalationTime' as const, title: 'Avg Escalation Time', icon: <Clock className="h-4 w-4" /> },
  { key: 'structuringCount' as const, title: 'Structuring Flags', icon: <Landmark className="h-4 w-4" /> },
  { key: 'sanctionsHits' as const, title: 'Sanctions Hits', icon: <Search className="h-4 w-4" /> },
];

const sarStages = ['drafted', 'reviewed', 'approved', 'filed'] as const;
const sarLabels: Record<string, string> = { drafted: 'Drafted', reviewed: 'Reviewed', approved: 'Approved', filed: 'Filed' };

const formatCurrency = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`;

const riskLevelColor = (level: string) => {
  if (level === 'critical') return 'text-destructive';
  if (level === 'high') return 'text-warning';
  return 'text-muted-foreground';
};

export function AMLTab({ data }: AMLTabProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: '' });

  const openKpiDrawer = (key: string) => {
    const kpi = data[key as keyof typeof data] as { value: number | string; delta: number; definition: string };
    const cfg = kpiConfig.find(k => k.key === key)!;
    setDrawer({
      open: true, title: cfg.title, definition: kpi.definition,
      sections: [{ label: 'Current Value', value: String(kpi.value) }, { label: 'Change', value: `${kpi.delta > 0 ? '+' : ''}${kpi.delta}%`, highlight: Math.abs(kpi.delta) > 10 }],
      breakdown: data.typologyDistribution.map(t => ({ label: t.name, value: t.percentage, total: 100 })),
      actions: [{ label: 'View Transactions', linkTo: '/transactions' }],
    });
  };

  const openCustomerDrawer = (c: AnalyticsData['aml']['highRiskCustomers'][0]) => {
    setDrawer({
      open: true, title: c.name, subtitle: c.id,
      sections: [
        { label: 'Risk Score', value: c.riskScore, highlight: c.riskScore >= 85 },
        { label: 'Exposure', value: formatCurrency(c.exposure) },
        { label: 'Typologies', value: c.typologyTags.join(', ') },
      ],
      actions: [{ label: 'Draft SAR', linkTo: '/ai-assistant', variant: 'default' }, { label: 'View Transactions', linkTo: '/transactions' }],
    });
  };

  const openCounterpartyDrawer = (cp: AnalyticsData['aml']['counterpartyRisk'][0]) => {
    setDrawer({
      open: true, title: cp.name, subtitle: cp.id,
      sections: [
        { label: 'Exposure', value: formatCurrency(cp.exposure) },
        { label: 'Country', value: cp.country },
        { label: 'Risk Level', value: cp.riskLevel.toUpperCase(), highlight: cp.riskLevel === 'critical' || cp.riskLevel === 'high' },
      ],
      actions: [{ label: 'Draft SAR', linkTo: '/ai-assistant', variant: 'default' }, { label: 'View Transactions', linkTo: '/transactions' }],
    });
  };

  const maxSar = Math.max(...sarStages.map(s => data.sarPipeline[s]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="aml-kpi-grid">
        {kpiConfig.map(cfg => {
          const kpi = data[cfg.key] as { value: number | string; delta: number; definition: string };
          const invertDelta = cfg.key === 'avgEscalationTime' || cfg.key === 'sanctionsHits';
          const isPositive = invertDelta ? kpi.delta < 0 : kpi.delta > 0;
          return (
            <div key={cfg.key} className="stat-card cursor-pointer hover-elevate" onClick={() => openKpiDrawer(cfg.key)} data-testid={`kpi-${cfg.key}`}>
              <div className="flex items-center justify-between gap-1 mb-1">
                <p className="text-sm font-medium text-muted-foreground">{cfg.title}</p>
                <Tooltip>
                  <TooltipTrigger asChild><span className="text-muted-foreground"><Info className="h-3.5 w-3.5" /></span></TooltipTrigger>
                  <TooltipContent className="max-w-[220px] text-xs">{kpi.definition}</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-2xl font-bold">{kpi.value}{typeof kpi.value === 'number' ? '' : ''}</p>
              <Badge variant="secondary" className={cn('mt-1 text-[10px]', isPositive ? 'text-success' : 'text-destructive')}>
                {kpi.delta > 0 ? '+' : ''}{kpi.delta}%
              </Badge>
            </div>
          );
        })}
      </div>

      <div className="stat-card h-[320px]" data-testid="aml-trend-chart">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">AML Alert Trend (12 Months)</h3>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={data.amlTrend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
            <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
            <RechartsTooltip contentStyle={chartTooltipStyle} />
            <Legend />
            <Line type="monotone" dataKey="alerts" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Alerts" />
            <Line type="monotone" dataKey="escalations" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} name="Escalations" />
            <Line type="monotone" dataKey="sarsFiled" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} name="SARs Filed" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="stat-card" data-testid="typology-distribution">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Typology Distribution</h3>
        <div className="space-y-2.5">
          {data.typologyDistribution.map(t => {
            const maxCount = Math.max(...data.typologyDistribution.map(x => x.count));
            return (
              <div key={t.name} className="flex items-center gap-3" data-testid={`typology-${t.name}`}>
                <span className="text-xs w-44 truncate">{t.name}</span>
                <div className="flex-1 bg-muted/30 rounded-full h-2">
                  <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${(t.count / maxCount) * 100}%` }} />
                </div>
                <span className="text-xs font-mono w-14 text-right">{t.count.toLocaleString()}</span>
                <Badge variant="secondary" className="text-[10px] w-12 justify-center">{t.percentage}%</Badge>
              </div>
            );
          })}
        </div>
      </div>

      <div className="stat-card" data-testid="sar-pipeline">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">SAR Pipeline</h3>
        <div className="flex items-center gap-1">
          {sarStages.map((stage, i) => {
            const val = data.sarPipeline[stage];
            const pct = maxSar > 0 ? (val / maxSar) * 100 : 0;
            const prev = i > 0 ? data.sarPipeline[sarStages[i - 1]] : null;
            const convRate = prev ? ((val / prev) * 100).toFixed(0) : null;
            return (
              <div key={stage} className="flex items-center flex-1 min-w-0" data-testid={`sar-${stage}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground truncate mb-1">{sarLabels[stage]}</p>
                  <div className="rounded bg-primary/10 relative overflow-hidden" style={{ height: 32 }}>
                    <div className={cn('h-full rounded transition-all', stage === 'filed' ? 'bg-success/70' : 'bg-primary/60')} style={{ width: `${Math.max(pct, 8)}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{val.toLocaleString()}</span>
                  </div>
                  {convRate && <p className="text-[9px] text-muted-foreground mt-0.5 text-center">{convRate}%</p>}
                </div>
                {i < sarStages.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5 shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="stat-card" data-testid="high-risk-customers-table">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">High-Risk Customers</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Risk</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Typologies</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Exposure</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.highRiskCustomers.map(c => (
                  <tr key={c.id} className="border-b border-border/50 cursor-pointer hover-elevate" onClick={() => openCustomerDrawer(c)} data-testid={`aml-customer-row-${c.id}`}>
                    <td className="py-2">
                      <div>{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.id}</div>
                    </td>
                    <td className="py-2 text-right">
                      <Badge variant="secondary" className={cn('text-[10px]', c.riskScore >= 90 ? 'text-destructive' : c.riskScore >= 80 ? 'text-warning' : 'text-muted-foreground')}>{c.riskScore}</Badge>
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">{c.typologyTags.slice(0, 2).map(t => <Badge key={t} variant="outline" className="text-[9px]">{t.replace(/_/g, ' ')}</Badge>)}{c.typologyTags.length > 2 && <Badge variant="outline" className="text-[9px]">+{c.typologyTags.length - 2}</Badge>}</div>
                    </td>
                    <td className="py-2 text-right font-mono">{formatCurrency(c.exposure)}</td>
                    <td className="py-2"><ChevronRight className="h-3 w-3 text-muted-foreground" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stat-card" data-testid="counterparty-risk-table">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Counterparty Risk</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Counterparty</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Exposure</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Country</th>
                  <th className="text-center py-2 font-medium text-muted-foreground">Risk</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.counterpartyRisk.map(cp => (
                  <tr key={cp.id} className="border-b border-border/50 cursor-pointer hover-elevate" onClick={() => openCounterpartyDrawer(cp)} data-testid={`counterparty-row-${cp.id}`}>
                    <td className="py-2">
                      <div>{cp.name}</div>
                      <div className="text-[10px] text-muted-foreground">{cp.id}</div>
                    </td>
                    <td className="py-2 text-right font-mono">{formatCurrency(cp.exposure)}</td>
                    <td className="py-2">{cp.country}</td>
                    <td className="py-2 text-center">
                      <Badge variant="secondary" className={cn('text-[10px]', riskLevelColor(cp.riskLevel))}>{cp.riskLevel}</Badge>
                    </td>
                    <td className="py-2"><ChevronRight className="h-3 w-3 text-muted-foreground" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnalyticsDrawer open={drawer.open} onOpenChange={o => setDrawer(prev => ({ ...prev, open: o }))} title={drawer.title} subtitle={drawer.subtitle} definition={drawer.definition} sections={drawer.sections} breakdown={drawer.breakdown} actions={drawer.actions} />
    </div>
  );
}
