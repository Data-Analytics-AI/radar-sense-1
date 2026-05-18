import { useState } from 'react';
import type { AnalyticsData } from '@/lib/analytics-data';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { ChevronRight, Users, UserCheck, Shield, Lock, KeyRound, AlertTriangle, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UsersTabProps {
  data: AnalyticsData['users'];
}

const chartTooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' };

type DrawerState = { open: boolean; title: string; subtitle?: string; definition?: string; sections?: { label: string; value: string | number; highlight?: boolean }[]; actions?: { label: string; linkTo?: string; onClick?: () => void; variant?: 'default' | 'outline' }[] };

const kpiConfig = [
  { key: 'totalUsers' as const, title: 'Total Users', icon: <Users className="h-4 w-4" /> },
  { key: 'activeUsers' as const, title: 'Active Users', icon: <UserCheck className="h-4 w-4" /> },
  { key: 'privilegedUsers' as const, title: 'Privileged Users', icon: <Shield className="h-4 w-4" /> },
  { key: 'mfaAdoption' as const, title: 'MFA Adoption', icon: <KeyRound className="h-4 w-4" />, suffix: '%' },
  { key: 'ssoAdoption' as const, title: 'SSO Adoption', icon: <Lock className="h-4 w-4" />, suffix: '%' },
  { key: 'failedLogins24h' as const, title: 'Failed Logins (24h)', icon: <AlertTriangle className="h-4 w-4" /> },
  { key: 'lockedUsers' as const, title: 'Locked Users', icon: <UserX className="h-4 w-4" /> },
];

export function UsersTab({ data }: UsersTabProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: '' });

  const openKpiDrawer = (key: string) => {
    const kpi = data[key as keyof typeof data] as { value: number | string; delta: number; definition: string };
    const cfg = kpiConfig.find(k => k.key === key)!;
    setDrawer({
      open: true, title: cfg.title, definition: kpi.definition,
      sections: [{ label: 'Current Value', value: `${kpi.value}${cfg.suffix || ''}` }, { label: 'Change', value: `${kpi.delta > 0 ? '+' : ''}${kpi.delta}%`, highlight: Math.abs(kpi.delta) > 10 }],
      actions: [{ label: 'View Users', linkTo: '/users' }],
    });
  };

  const openAnalystDrawer = (a: AnalyticsData['users']['analystProductivity'][0]) => {
    setDrawer({
      open: true, title: a.name, subtitle: 'Analyst Productivity',
      sections: [
        { label: 'Cases Handled', value: a.casesHandled },
        { label: 'Avg Review Time', value: `${a.avgReviewTime} mins` },
        { label: 'SLA Breaches', value: a.slaBreaches, highlight: a.slaBreaches > 3 },
      ],
      actions: [{ label: 'View Profile', linkTo: '/users' }],
    });
  };

  const openAccessDrawer = (u: AnalyticsData['users']['unusualAccess'][0]) => {
    setDrawer({
      open: true, title: u.name, subtitle: u.userId,
      sections: [
        { label: 'Pattern', value: u.pattern },
        { label: 'Exports', value: u.exports, highlight: u.exports > 5 },
        { label: 'Unusual Time', value: u.unusualTime ? 'Yes' : 'No', highlight: u.unusualTime },
        { label: 'Last Action', value: new Date(u.lastAction).toLocaleString() },
      ],
      actions: [{ label: 'Suspend User', variant: 'default' }, { label: 'View Activity', linkTo: '/users' }],
    });
  };

  const maxRole = Math.max(...data.roleDistribution.map(r => r.count));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {kpiConfig.map(cfg => {
          const kpi = data[cfg.key] as { value: number | string; delta: number; definition: string };
          const invertedKeys = ['failedLogins24h', 'lockedUsers'];
          const isPositive = invertedKeys.includes(cfg.key) ? kpi.delta < 0 : kpi.delta > 0;
          return (
            <div key={cfg.key} className="stat-card cursor-pointer hover-elevate" onClick={() => openKpiDrawer(cfg.key)} data-testid={`kpi-${cfg.key}`}>
              <div className="flex items-center gap-1.5 mb-1 text-muted-foreground">{cfg.icon}<p className="text-[10px] font-medium truncate">{cfg.title}</p></div>
              <p className="text-lg font-bold">{kpi.value}{cfg.suffix || ''}</p>
              <Badge variant="secondary" className={cn("text-[9px] mt-1", isPositive ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                {kpi.delta > 0 ? '+' : ''}{kpi.delta}%
              </Badge>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <p className="text-sm font-medium mb-2 text-muted-foreground">Login Trend</p>
          <div className="rounded-lg border border-border p-4 bg-card h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.loginsTrend} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <RechartsTooltip contentStyle={chartTooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                <Area type="monotone" dataKey="logins" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.15)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="text-sm font-medium mb-2 text-muted-foreground">Failed Login Attempts</p>
          <div className="rounded-lg border border-border p-4 bg-card h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.failedLoginsTrend} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <RechartsTooltip contentStyle={chartTooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
                <Bar dataKey="failed" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Analyst Productivity</p>
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2.5 font-medium">Name</th>
                <th className="text-right p-2.5 font-medium">Cases</th>
                <th className="text-right p-2.5 font-medium">Avg Review (min)</th>
                <th className="text-right p-2.5 font-medium">SLA Breaches</th>
                <th className="w-8 p-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.analystProductivity.map(a => (
                <tr key={a.name} className="border-b border-border/50 cursor-pointer hover-elevate"
                  onClick={() => openAnalystDrawer(a)} data-testid={`analyst-row-${a.name.replace(/\s+/g, '-').toLowerCase()}`}>
                  <td className="p-2.5 font-medium">{a.name}</td>
                  <td className="p-2.5 text-right font-mono">{a.casesHandled}</td>
                  <td className="p-2.5 text-right font-mono">{a.avgReviewTime}</td>
                  <td className="p-2.5 text-right">
                    <Badge variant={a.slaBreaches > 3 ? 'destructive' : 'secondary'} className="text-[10px]">{a.slaBreaches}</Badge>
                  </td>
                  <td className="p-2.5"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Unusual Access Patterns</p>
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2.5 font-medium">User ID</th>
                <th className="text-left p-2.5 font-medium">Name</th>
                <th className="text-left p-2.5 font-medium">Pattern</th>
                <th className="text-right p-2.5 font-medium">Exports</th>
                <th className="p-2.5 font-medium">Time</th>
                <th className="text-left p-2.5 font-medium hidden md:table-cell">Last Action</th>
                <th className="w-8 p-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.unusualAccess.map(u => (
                <tr key={u.userId} className="border-b border-border/50 cursor-pointer hover-elevate"
                  onClick={() => openAccessDrawer(u)} data-testid={`access-row-${u.userId}`}>
                  <td className="p-2.5 font-mono text-muted-foreground">{u.userId}</td>
                  <td className="p-2.5 font-medium">{u.name}</td>
                  <td className="p-2.5 max-w-[200px] truncate">{u.pattern}</td>
                  <td className="p-2.5 text-right font-mono">{u.exports}</td>
                  <td className="p-2.5">
                    <Badge variant={u.unusualTime ? 'destructive' : 'secondary'} className="text-[10px]">
                      {u.unusualTime ? 'Unusual' : 'Normal'}
                    </Badge>
                  </td>
                  <td className="p-2.5 hidden md:table-cell text-muted-foreground">{new Date(u.lastAction).toLocaleString()}</td>
                  <td className="p-2.5"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Role Distribution</p>
        <div className="rounded-lg border border-border p-4 bg-card space-y-2">
          {data.roleDistribution.map(r => (
            <div key={r.role} className="flex items-center gap-3" data-testid={`role-bar-${r.role.replace(/\s+/g, '-').toLowerCase()}`}>
              <span className="text-xs w-32 truncate">{r.role}</span>
              <div className="flex-1 bg-muted/30 rounded-full h-2">
                <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${(r.count / maxRole) * 100}%` }} />
              </div>
              <span className="text-xs font-mono w-8 text-right">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      <AnalyticsDrawer open={drawer.open} onOpenChange={o => setDrawer(prev => ({ ...prev, open: o }))}
        title={drawer.title} subtitle={drawer.subtitle} definition={drawer.definition} sections={drawer.sections} actions={drawer.actions} />
    </div>
  );
}
