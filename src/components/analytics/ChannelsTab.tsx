import { useState } from 'react';
import type { AnalyticsData } from '@/lib/analytics-data';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChannelsTabProps {
  data: AnalyticsData['channels'];
}

const chartTooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' };

type DrawerState = { open: boolean; title: string; subtitle?: string; sections?: { label: string; value: string | number; highlight?: boolean }[]; drivers?: { label: string; value: string | number; trend?: number }[]; actions?: { label: string; linkTo?: string; variant?: 'default' | 'outline' }[] };

const channelColors: Record<string, string> = { pos: '#8b5cf6', web: '#3b82f6', mobile: '#10b981', atm: '#f59e0b', branch: '#6b7280' };

export function ChannelsTab({ data }: ChannelsTabProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: '' });

  const openChannelDrawer = (ch: AnalyticsData['channels']['channelVolume'][0]) => {
    setDrawer({
      open: true, title: ch.name, subtitle: 'Channel Details',
      sections: [
        { label: 'Volume', value: ch.volume.toLocaleString() },
        { label: 'Risk Score', value: ch.risk, highlight: ch.risk > 40 },
        { label: 'Alerts per 1K', value: ch.alertsPer1k },
        { label: 'False Positive Rate', value: `${ch.falsePositiveRate}%`, highlight: ch.falsePositiveRate > 15 },
      ],
      drivers: [
        { label: 'Velocity anomalies', value: 'Primary', trend: 8 },
        { label: 'Geo mismatch', value: 'Secondary', trend: 3 },
        { label: 'Device fingerprint', value: 'Tertiary', trend: -2 },
      ],
      actions: [
        { label: 'View Transactions', linkTo: '/transactions' },
        { label: 'Configure Controls', linkTo: '/rules', variant: 'default' },
      ],
    });
  };

  const maxFunnel = Math.max(...data.channelFunnel.flatMap(c => [c.flagged, c.reviewed, c.confirmed]));

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Channel Volume Distribution</p>
        <div className="rounded-lg border border-border p-4 bg-card h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.channelVolume} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : v} />
              <RechartsTooltip contentStyle={chartTooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
              <Bar dataKey="volume" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Channel Risk Trend (12 Months)</p>
        <div className="rounded-lg border border-border p-4 bg-card h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.channelRiskTrend} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
              <RechartsTooltip contentStyle={chartTooltipStyle} labelStyle={{ color: 'hsl(var(--foreground))' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {Object.entries(channelColors).map(([key, color]) => (
                <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} name={key.toUpperCase()} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Channel Comparison</p>
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2.5 font-medium">Channel</th>
                <th className="text-right p-2.5 font-medium">Volume</th>
                <th className="p-2.5 font-medium w-32">Risk</th>
                <th className="text-right p-2.5 font-medium">Alerts/1K</th>
                <th className="text-right p-2.5 font-medium">FP Rate</th>
                <th className="w-8 p-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {data.channelVolume.map(ch => (
                <tr key={ch.name} className="border-b border-border/50 cursor-pointer hover-elevate"
                  onClick={() => openChannelDrawer(ch)} data-testid={`channel-row-${ch.name.toLowerCase()}`}>
                  <td className="p-2.5 font-medium">{ch.name}</td>
                  <td className="p-2.5 text-right font-mono">{ch.volume.toLocaleString()}</td>
                  <td className="p-2.5">
                    <div className="flex items-center gap-2">
                      <Progress value={ch.risk} className="h-1.5 flex-1" />
                      <span className="font-mono w-8 text-right">{ch.risk}</span>
                    </div>
                  </td>
                  <td className="p-2.5 text-right font-mono">{ch.alertsPer1k}</td>
                  <td className="p-2.5 text-right font-mono">{ch.falsePositiveRate}%</td>
                  <td className="p-2.5"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Channel Alert Funnel</p>
        <div className="space-y-3">
          {data.channelFunnel.map(ch => (
            <div key={ch.name} className="rounded-lg border border-border p-3 bg-card" data-testid={`funnel-${ch.name.toLowerCase()}`}>
              <p className="text-xs font-medium mb-2">{ch.name}</p>
              <div className="space-y-1.5">
                {(['flagged', 'reviewed', 'confirmed'] as const).map(stage => (
                  <div key={stage} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-16 capitalize">{stage}</span>
                    <div className="flex-1 bg-muted/30 rounded-full h-2">
                      <div className={cn("rounded-full h-2 transition-all",
                        stage === 'flagged' ? 'bg-muted-foreground' : stage === 'reviewed' ? 'bg-primary' : 'bg-destructive'
                      )} style={{ width: `${(ch[stage] / maxFunnel) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-mono w-14 text-right">{ch[stage].toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <AnalyticsDrawer open={drawer.open} onOpenChange={o => setDrawer(prev => ({ ...prev, open: o }))}
        title={drawer.title} subtitle={drawer.subtitle} sections={drawer.sections} drivers={drawer.drivers} actions={drawer.actions} />
    </div>
  );
}
