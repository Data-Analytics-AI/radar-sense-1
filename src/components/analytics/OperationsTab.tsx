import { useState } from 'react';
import type { AnalyticsData } from '@/lib/analytics-data';
import { AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { Info, ChevronRight, AlertTriangle, Clock, TrendingDown, Inbox, Briefcase, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OperationsTabProps {
  data: AnalyticsData['operations'];
}

const chartTooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' };

type DrawerState = { open: boolean; title: string; subtitle?: string; definition?: string; sections?: { label: string; value: string | number; highlight?: boolean }[]; actions?: { label: string; linkTo?: string; variant?: 'default' | 'outline' }[]; children?: React.ReactNode };

const kpiConfig = [
  { key: 'openAlerts' as const, title: 'Open Alerts', icon: <Inbox className="h-4 w-4" /> },
  { key: 'openCases' as const, title: 'Open Cases', icon: <Briefcase className="h-4 w-4" /> },
  { key: 'slaBreachRisk' as const, title: 'SLA Breach Risk', icon: <ShieldAlert className="h-4 w-4" /> },
  { key: 'avgTimeToTriage' as const, title: 'Avg Time to Triage', icon: <Clock className="h-4 w-4" /> },
  { key: 'avgTimeToResolution' as const, title: 'Avg Time to Resolution', icon: <Clock className="h-4 w-4" /> },
  { key: 'backlogTrend' as const, title: 'Backlog Trend', icon: <TrendingDown className="h-4 w-4" /> },
];

const oldBuckets = ['30-60d', '60-90d', '90d+', '>90d', '60+', '90+'];

export function OperationsTab({ data }: OperationsTabProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: '' });

  const openKpiDrawer = (key: string) => {
    const kpi = data[key as keyof typeof data] as { value: number | string; delta: number; definition: string };
    const cfg = kpiConfig.find(k => k.key === key)!;
    setDrawer({
      open: true, title: cfg.title, definition: kpi.definition,
      sections: [{ label: 'Current Value', value: String(kpi.value) }, { label: 'Change', value: `${kpi.delta > 0 ? '+' : ''}${kpi.delta}%`, highlight: Math.abs(kpi.delta) > 10 }],
      actions: [{ label: 'View Cases', linkTo: '/cases' }],
    });
  };

  const openCaseDrawer = (c: AnalyticsData['operations']['oldestCases'][0]) => {
    setDrawer({
      open: true, title: c.title, subtitle: c.id,
      sections: [{ label: 'Age (days)', value: c.age, highlight: c.age > 30 }, { label: 'Assignee', value: c.assignee }, { label: 'Priority', value: c.priority, highlight: c.priority === 'critical' || c.priority === 'high' }],
      actions: [{ label: 'View Case', linkTo: '/cases', variant: 'default' }],
    });
  };

  const openTeamDrawer = (t: AnalyticsData['operations']['teamQueues'][0]) => {
    setDrawer({
      open: true, title: t.team, subtitle: 'Team Queue',
      sections: [{ label: 'Open', value: t.open }, { label: 'In Review', value: t.inReview }, { label: 'Breached', value: t.breached, highlight: t.breached > 0 }],
      actions: [{ label: 'View Cases', linkTo: '/cases' }],
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {kpiConfig.map(cfg => {
          const kpi = data[cfg.key] as { value: number | string; delta: number; definition: string };
          return (
            <button key={cfg.key} onClick={() => openKpiDrawer(cfg.key)} data-testid={`kpi-${cfg.key}`}
              className="p-4 rounded-lg border border-border/60 bg-card text-left hover-elevate active-elevate-2 transition-colors">
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-xs text-muted-foreground">{cfg.title}</span>
                <span className="text-muted-foreground/60">{cfg.icon}</span>
              </div>
              <p className="text-xl font-bold">{String(kpi.value)}</p>
              <div className="flex items-center gap-1 mt-1">
                <Badge variant="secondary" className={cn("text-[10px]", kpi.delta > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                  {kpi.delta > 0 ? '+' : ''}{kpi.delta}%
                </Badge>
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Backlog Trend (12 months)</h3>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.backlogTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <RechartsTooltip contentStyle={chartTooltipStyle} />
              <Legend />
              <Area type="monotone" dataKey="alerts" stackId="1" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" fillOpacity={0.4} name="Alerts" />
              <Area type="monotone" dataKey="cases" stackId="1" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.4} name="Cases" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">SLA Compliance Trend</h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.slaComplianceTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[80, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <RechartsTooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`${v}%`, 'Compliance']} />
              <ReferenceLine y={95} stroke="hsl(var(--destructive))" strokeDasharray="6 3" label={{ value: '95% Target', position: 'right', fill: 'hsl(var(--destructive))', fontSize: 10 }} />
              <Line type="monotone" dataKey="compliance" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} name="Compliance %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Case Aging Histogram</h3>
        <div className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.caseAging}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <RechartsTooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" name="Cases" radius={[4, 4, 0, 0]}>
                {data.caseAging.map((entry, i) => (
                  <rect key={i} fill={oldBuckets.some(b => entry.bucket.toLowerCase().includes(b.replace('d', '').replace('+', ''))) || i >= data.caseAging.length - 2 ? 'hsl(var(--destructive))' : 'hsl(var(--chart-1))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Oldest Cases</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">ID</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Title</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Age (days)</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Assignee</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Priority</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {data.oldestCases.map(c => (
                <tr key={c.id} onClick={() => openCaseDrawer(c)} data-testid={`row-case-${c.id}`}
                  className="border-b border-border/30 cursor-pointer hover-elevate active-elevate-2">
                  <td className="py-2 px-2 font-mono">{c.id}</td>
                  <td className="py-2 px-2">{c.title}</td>
                  <td className={cn("py-2 px-2 font-mono", c.age > 30 && "text-destructive font-semibold")}>{c.age}</td>
                  <td className="py-2 px-2">{c.assignee}</td>
                  <td className="py-2 px-2">
                    <Badge variant={c.priority === 'critical' ? 'destructive' : c.priority === 'high' ? 'default' : 'secondary'} className="text-[10px]">
                      {c.priority}
                    </Badge>
                  </td>
                  <td className="py-2"><ChevronRight className="h-3 w-3 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Team Queues</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Team</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Open</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">In Review</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground">Breached</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {data.teamQueues.map(t => (
                <tr key={t.team} onClick={() => openTeamDrawer(t)} data-testid={`row-team-${t.team.toLowerCase().replace(/\s+/g, '-')}`}
                  className="border-b border-border/30 cursor-pointer hover-elevate active-elevate-2">
                  <td className="py-2 px-2 font-medium">{t.team}</td>
                  <td className="py-2 px-2 font-mono">{t.open}</td>
                  <td className="py-2 px-2 font-mono">{t.inReview}</td>
                  <td className={cn("py-2 px-2 font-mono font-semibold", t.breached > 0 && "text-destructive")}>{t.breached}</td>
                  <td className="py-2"><ChevronRight className="h-3 w-3 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnalyticsDrawer open={drawer.open} onOpenChange={o => setDrawer(p => ({ ...p, open: o }))} title={drawer.title} subtitle={drawer.subtitle} definition={drawer.definition} sections={drawer.sections} actions={drawer.actions}>
        {drawer.children}
      </AnalyticsDrawer>
    </div>
  );
}
