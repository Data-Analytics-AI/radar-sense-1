import { useState } from 'react';
import type { AnalyticsData } from '@/lib/analytics-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { ChevronRight, Target, ShieldCheck, Volume2, Clock, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RulesTabProps {
  data: AnalyticsData['rules'];
}

type DrawerState = {
  open: boolean; title: string; subtitle?: string; definition?: string;
  sections?: { label: string; value: string | number; highlight?: boolean }[];
  actions?: { label: string; linkTo?: string; onClick?: () => void; variant?: 'default' | 'outline' }[];
  children?: React.ReactNode;
};

const kpiConfig = [
  { key: 'totalTriggers' as const, title: 'Total Triggers', icon: <Target className="h-4 w-4" /> },
  { key: 'confirmedFraudRate' as const, title: 'Confirmed Fraud Rate', icon: <ShieldCheck className="h-4 w-4" />, suffix: '%' },
  { key: 'noiseRate' as const, title: 'Noise Rate', icon: <Volume2 className="h-4 w-4" />, suffix: '%' },
  { key: 'avgTimeToReview' as const, title: 'Avg Time to Review', icon: <Clock className="h-4 w-4" /> },
  { key: 'lastTunedDate' as const, title: 'Last Tuned', icon: <CalendarDays className="h-4 w-4" /> },
];

const formatCurrency = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`;

const statusVariant = (s: string): 'default' | 'secondary' | 'outline' | 'destructive' =>
  s === 'active' ? 'default' : s === 'under_review' ? 'secondary' : 'outline';

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 40},${16 - ((v - min) / range) * 14}`).join(' ');
  return (
    <svg width={40} height={16} className="inline-block" aria-hidden="true">
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RulesTab({ data }: RulesTabProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: '' });

  const openKpiDrawer = (key: string) => {
    const kpi = data[key as keyof typeof data] as { value: number | string; delta: number; definition: string };
    const cfg = kpiConfig.find(k => k.key === key)!;
    setDrawer({
      open: true, title: cfg.title, definition: kpi.definition,
      sections: [
        { label: 'Current Value', value: `${kpi.value}${cfg.suffix || ''}` },
        { label: 'Change', value: `${kpi.delta > 0 ? '+' : ''}${kpi.delta}%`, highlight: Math.abs(kpi.delta) > 10 },
      ],
      actions: [{ label: 'View Rules', linkTo: '/rules' }],
    });
  };

  const openRuleDrawer = (rule: AnalyticsData['rules']['rulesTable'][0]) => {
    setDrawer({
      open: true, title: rule.name, subtitle: rule.id,
      definition: `Rule ${rule.id} triggers on ${rule.category} patterns. Current true fraud rate: ${rule.trueFraudPct}%, noise: ${rule.noisePct}%.`,
      sections: [
        { label: 'Trigger Count', value: rule.triggerCount.toLocaleString() },
        { label: 'True Fraud %', value: `${rule.trueFraudPct}%`, highlight: rule.trueFraudPct < 50 },
        { label: 'Noise %', value: `${rule.noisePct}%`, highlight: rule.noisePct > 40 },
        { label: 'Net Value Prevented', value: formatCurrency(rule.netValuePrevented) },
        { label: 'Category', value: rule.category },
        { label: 'Status', value: rule.status },
      ],
      actions: [
        { label: 'Simulate Change', variant: 'outline' },
        { label: 'Propose Tuning', variant: 'default' },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {kpiConfig.map(cfg => {
          const kpi = data[cfg.key];
          return (
            <button key={cfg.key} onClick={() => openKpiDrawer(cfg.key)}
              className="flex flex-col gap-1 p-3 rounded-lg border border-border/50 bg-muted/20 hover-elevate text-left"
              data-testid={`kpi-${cfg.key}`}>
              <div className="flex items-center gap-2 text-muted-foreground">
                {cfg.icon}
                <span className="text-[10px] uppercase tracking-wider font-medium">{cfg.title}</span>
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-lg font-bold">{kpi.value}{typeof kpi.value === 'number' ? (cfg.suffix || '') : ''}</span>
                {kpi.delta !== 0 && (
                  <Badge variant="secondary" className={cn("text-[9px]", kpi.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                    {kpi.delta > 0 ? '+' : ''}{kpi.delta}%
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/50">
        <div className="p-4 border-b border-border/50">
          <h3 className="text-sm font-semibold">Rules Effectiveness</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">{data.rulesTable.length} rules evaluated</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="text-left py-2.5 px-3 font-medium">Rule</th>
                <th className="text-left py-2.5 px-2 font-medium">Category</th>
                <th className="text-right py-2.5 px-2 font-medium">Triggers</th>
                <th className="text-right py-2.5 px-2 font-medium">True Fraud %</th>
                <th className="text-right py-2.5 px-2 font-medium">Noise %</th>
                <th className="text-right py-2.5 px-2 font-medium">Value Prevented</th>
                <th className="text-left py-2.5 px-2 font-medium">Updated</th>
                <th className="text-left py-2.5 px-2 font-medium">Status</th>
                <th className="py-2.5 px-2 font-medium">Trend</th>
                <th className="py-2.5 px-2 w-6"></th>
              </tr>
            </thead>
            <tbody>
              {data.rulesTable.map(rule => (
                <tr key={rule.id} onClick={() => openRuleDrawer(rule)}
                  className="border-b border-border/30 hover-elevate cursor-pointer"
                  data-testid={`rule-row-${rule.id}`}>
                  <td className="py-2.5 px-3 font-medium">{rule.name}</td>
                  <td className="py-2.5 px-2">
                    <Badge variant="outline" className="text-[9px] capitalize">{rule.category}</Badge>
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono">{rule.triggerCount.toLocaleString()}</td>
                  <td className={cn("py-2.5 px-2 text-right font-mono", rule.trueFraudPct >= 70 ? "text-emerald-600 dark:text-emerald-400" : rule.trueFraudPct < 50 ? "text-destructive" : "")}>
                    {rule.trueFraudPct}%
                  </td>
                  <td className={cn("py-2.5 px-2 text-right font-mono", rule.noisePct > 40 ? "text-destructive" : rule.noisePct <= 15 ? "text-emerald-600 dark:text-emerald-400" : "")}>
                    {rule.noisePct}%
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono">{formatCurrency(rule.netValuePrevented)}</td>
                  <td className="py-2.5 px-2 text-muted-foreground">{rule.lastUpdated}</td>
                  <td className="py-2.5 px-2">
                    <Badge variant={statusVariant(rule.status)} className="text-[9px] capitalize">{rule.status.replace('_', ' ')}</Badge>
                  </td>
                  <td className="py-2.5 px-2">
                    <Sparkline data={rule.triggerTrend} />
                  </td>
                  <td className="py-2.5 px-2">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnalyticsDrawer open={drawer.open} onOpenChange={(o) => setDrawer(s => ({ ...s, open: o }))}
        title={drawer.title} subtitle={drawer.subtitle} definition={drawer.definition}
        sections={drawer.sections} actions={drawer.actions} />
    </div>
  );
}
