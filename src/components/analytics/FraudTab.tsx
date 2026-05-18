import { useState } from 'react';
import type { AnalyticsData } from '@/lib/analytics-data';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { Info, ChevronRight, Shield, DollarSign, Clock, AlertTriangle, Target, Fingerprint } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FraudTabProps {
  data: AnalyticsData['fraud'];
}

const chartTooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' };

type DrawerState = { open: boolean; title: string; subtitle?: string; definition?: string; sections?: { label: string; value: string | number; highlight?: boolean }[]; breakdown?: { label: string; value: number; total?: number }[]; actions?: { label: string; linkTo?: string; variant?: 'default' | 'outline' }[] };

const kpiConfig = [
  { key: 'detectionRate' as const, title: 'Detection Rate', icon: <Target className="h-4 w-4" />, suffix: '%' },
  { key: 'preventedValue' as const, title: 'Prevented Value', icon: <DollarSign className="h-4 w-4" /> },
  { key: 'confirmedLoss' as const, title: 'Confirmed Loss', icon: <AlertTriangle className="h-4 w-4" /> },
  { key: 'falsePositiveRate' as const, title: 'False Positive Rate', icon: <Shield className="h-4 w-4" />, suffix: '%' },
  { key: 'avgTimeToDetect' as const, title: 'Avg Time to Detect', icon: <Clock className="h-4 w-4" /> },
  { key: 'avgTimeToContain' as const, title: 'Avg Time to Contain', icon: <Clock className="h-4 w-4" /> },
];

const funnelStages = ['flagged', 'reviewed', 'escalated', 'confirmedFraud', 'sarFiled'] as const;
const funnelLabels: Record<string, string> = { flagged: 'Flagged', reviewed: 'Reviewed', escalated: 'Escalated', confirmedFraud: 'Confirmed', sarFiled: 'SAR Filed' };

export function FraudTab({ data }: FraudTabProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: '' });

  const openKpiDrawer = (key: string) => {
    const kpi = data[key as keyof typeof data] as { value: number | string; delta: number; definition: string };
    const cfg = kpiConfig.find(k => k.key === key)!;
    setDrawer({
      open: true, title: cfg.title, definition: kpi.definition,
      sections: [{ label: 'Current Value', value: String(kpi.value) }, { label: 'Change', value: `${kpi.delta > 0 ? '+' : ''}${kpi.delta}%`, highlight: kpi.delta > 5 }],
      actions: [{ label: 'View Transactions', linkTo: '/transactions' }],
    });
  };

  const openMerchantDrawer = (m: AnalyticsData['fraud']['riskyMerchants'][0]) => {
    setDrawer({
      open: true, title: m.name, subtitle: m.id,
      sections: [{ label: 'Risk Score', value: m.riskScore, highlight: m.riskScore >= 80 }, { label: 'Volume', value: m.volume.toLocaleString() }, { label: 'Confirmed Fraud', value: m.confirmedFraud, highlight: true }, { label: 'Country', value: m.country }],
      actions: [{ label: 'View Transactions', linkTo: '/transactions' }, { label: 'Open Case', linkTo: '/cases', variant: 'default' }],
    });
  };

  const openCustomerDrawer = (c: AnalyticsData['fraud']['riskyCustomers'][0]) => {
    setDrawer({
      open: true, title: c.name, subtitle: c.id,
      sections: [{ label: 'Risk Score', value: c.riskScore, highlight: c.riskScore >= 80 }, { label: 'Linked Cases', value: c.linkedCases }, { label: 'Flags', value: c.flags.join(', ') }],
      actions: [{ label: 'View Profile', linkTo: '/transactions' }, { label: 'Open Case', linkTo: '/cases', variant: 'default' }],
    });
  };

  const openDeviceDrawer = (d: AnalyticsData['fraud']['riskyDevices'][0]) => {
    setDrawer({
      open: true, title: d.type, subtitle: d.id,
      sections: [{ label: 'Trust Level', value: `${d.trustLevel}%`, highlight: d.trustLevel < 30 }, { label: 'Geo Mismatch', value: d.geoMismatch ? 'Yes' : 'No', highlight: d.geoMismatch }, { label: 'Last Seen', value: new Date(d.lastSeen).toLocaleString() }],
      actions: [{ label: 'View Transactions', linkTo: '/transactions' }, { label: 'Block Device', variant: 'default' }],
    });
  };

  const maxFunnel = data.alertFunnel.flagged;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {kpiConfig.map(cfg => {
          const kpi = data[cfg.key] as { value: number | string; delta: number; definition: string };
          const isPositive = cfg.key === 'confirmedLoss' || cfg.key === 'falsePositiveRate' || cfg.key === 'avgTimeToDetect' || cfg.key === 'avgTimeToContain' ? kpi.delta < 0 : kpi.delta > 0;
          return (
            <div key={cfg.key} className="stat-card cursor-pointer hover-elevate" onClick={() => openKpiDrawer(cfg.key)} data-testid={`kpi-${cfg.key}`}>
              <div className="flex items-center justify-between gap-1 mb-1">
                <p className="text-sm font-medium text-muted-foreground">{cfg.title}</p>
                <Tooltip>
                  <TooltipTrigger asChild><span className="text-muted-foreground"><Info className="h-3.5 w-3.5" /></span></TooltipTrigger>
                  <TooltipContent className="max-w-[220px] text-xs">{kpi.definition}</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-2xl font-bold">{kpi.value}{cfg.suffix && typeof kpi.value === 'number' ? cfg.suffix : ''}</p>
              <Badge variant="secondary" className={cn('mt-1 text-[10px]', isPositive ? 'text-success' : 'text-destructive')}>
                {kpi.delta > 0 ? '+' : ''}{kpi.delta}%
              </Badge>
            </div>
          );
        })}
      </div>

      <div className="stat-card h-[320px]">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Fraud Detection Trend (12 Months)</h3>
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={data.fraudTrend} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
            <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
            <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
            <RechartsTooltip contentStyle={chartTooltipStyle} />
            <Legend />
            <Area yAxisId="left" type="monotone" dataKey="detected" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} name="Detected" />
            <Area yAxisId="left" type="monotone" dataKey="prevented" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.1} strokeWidth={2} name="Prevented" />
            <Area yAxisId="right" type="monotone" dataKey="actualLoss" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.05} strokeWidth={2} name="Actual Loss ($)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="stat-card">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Alert Funnel</h3>
        <div className="flex items-center gap-1">
          {funnelStages.map((stage, i) => {
            const val = data.alertFunnel[stage];
            const pct = maxFunnel > 0 ? (val / maxFunnel) * 100 : 0;
            const prev = i > 0 ? data.alertFunnel[funnelStages[i - 1]] : null;
            const convRate = prev ? ((val / prev) * 100).toFixed(0) : null;
            return (
              <div key={stage} className="flex items-center flex-1 min-w-0" data-testid={`funnel-${stage}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground truncate mb-1">{funnelLabels[stage]}</p>
                  <div className="rounded bg-primary/10 relative overflow-hidden" style={{ height: 32 }}>
                    <div className={cn('h-full rounded transition-all', i === funnelStages.length - 1 ? 'bg-destructive/70' : 'bg-primary/60')} style={{ width: `${Math.max(pct, 8)}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">{val.toLocaleString()}</span>
                  </div>
                  {convRate && <p className="text-[9px] text-muted-foreground mt-0.5 text-center">{convRate}%</p>}
                </div>
                {i < funnelStages.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground mx-0.5 shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Top Fraud Typologies</h3>
        <div className="space-y-2.5">
          {data.topTypologies.map(t => {
            const maxCount = Math.max(...data.topTypologies.map(x => x.count));
            return (
              <div key={t.name} className="flex items-center gap-3" data-testid={`typology-${t.name}`}>
                <span className="text-xs w-40 truncate">{t.name}</span>
                <div className="flex-1 bg-muted/30 rounded-full h-2">
                  <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${(t.count / maxCount) * 100}%` }} />
                </div>
                <span className="text-xs font-mono w-14 text-right">{t.count.toLocaleString()}</span>
                <span className="text-xs font-mono w-16 text-right text-muted-foreground">${(t.value / 1e6).toFixed(1)}M</span>
                <Badge variant="secondary" className={cn('text-[10px] w-12 justify-center', t.trend > 0 ? 'text-destructive' : 'text-success')}>
                  {t.trend > 0 ? '+' : ''}{t.trend}%
                </Badge>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="stat-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Top Risky Merchants</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Merchant</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Risk</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Vol</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Fraud</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Country</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.riskyMerchants.map(m => (
                  <tr key={m.id} className="border-b border-border/50 cursor-pointer hover-elevate" onClick={() => openMerchantDrawer(m)} data-testid={`merchant-row-${m.id}`}>
                    <td className="py-2">{m.name}</td>
                    <td className="py-2 text-right"><Badge variant="secondary" className={cn('text-[10px]', m.riskScore >= 80 ? 'text-destructive' : m.riskScore >= 60 ? 'text-warning' : 'text-success')}>{m.riskScore}</Badge></td>
                    <td className="py-2 text-right font-mono">{m.volume.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono text-destructive">{m.confirmedFraud}</td>
                    <td className="py-2">{m.country}</td>
                    <td className="py-2"><ChevronRight className="h-3 w-3 text-muted-foreground" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Top Risky Customers</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-medium text-muted-foreground">Customer</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Risk</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Flags</th>
                  <th className="text-right py-2 font-medium text-muted-foreground">Cases</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.riskyCustomers.map(c => (
                  <tr key={c.id} className="border-b border-border/50 cursor-pointer hover-elevate" onClick={() => openCustomerDrawer(c)} data-testid={`customer-row-${c.id}`}>
                    <td className="py-2">{c.name}</td>
                    <td className="py-2 text-right"><Badge variant="secondary" className={cn('text-[10px]', c.riskScore >= 80 ? 'text-destructive' : 'text-warning')}>{c.riskScore}</Badge></td>
                    <td className="py-2"><div className="flex flex-wrap gap-1">{c.flags.slice(0, 2).map(f => <Badge key={f} variant="outline" className="text-[9px]">{f.replace(/_/g, ' ')}</Badge>)}{c.flags.length > 2 && <Badge variant="outline" className="text-[9px]">+{c.flags.length - 2}</Badge>}</div></td>
                    <td className="py-2 text-right font-mono">{c.linkedCases}</td>
                    <td className="py-2"><ChevronRight className="h-3 w-3 text-muted-foreground" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Top Risky Devices</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-medium text-muted-foreground">Device ID</th>
                <th className="text-left py-2 font-medium text-muted-foreground">Type</th>
                <th className="text-left py-2 font-medium text-muted-foreground w-32">Trust Level</th>
                <th className="text-center py-2 font-medium text-muted-foreground">Geo Mismatch</th>
                <th className="text-right py-2 font-medium text-muted-foreground">Last Seen</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {data.riskyDevices.map(d => (
                <tr key={d.id} className="border-b border-border/50 cursor-pointer hover-elevate" onClick={() => openDeviceDrawer(d)} data-testid={`device-row-${d.id}`}>
                  <td className="py-2 font-mono">{d.id}</td>
                  <td className="py-2">{d.type}</td>
                  <td className="py-2"><div className="flex items-center gap-2"><Progress value={d.trustLevel} className="h-1.5 flex-1" /><span className="font-mono w-8 text-right">{d.trustLevel}%</span></div></td>
                  <td className="py-2 text-center">{d.geoMismatch ? <Badge variant="destructive" className="text-[10px]">Mismatch</Badge> : <Badge variant="secondary" className="text-[10px]">OK</Badge>}</td>
                  <td className="py-2 text-right text-muted-foreground">{new Date(d.lastSeen).toLocaleDateString()}</td>
                  <td className="py-2"><ChevronRight className="h-3 w-3 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnalyticsDrawer open={drawer.open} onOpenChange={o => setDrawer(prev => ({ ...prev, open: o }))} title={drawer.title} subtitle={drawer.subtitle} definition={drawer.definition} sections={drawer.sections} actions={drawer.actions} />
    </div>
  );
}
