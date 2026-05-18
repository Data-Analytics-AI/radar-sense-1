import { useState } from 'react';
import type { AnalyticsData } from '@/lib/analytics-data';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { Info, Brain, Target, Activity, Gauge, Clock, Database, BarChart3, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface ModelsTabProps {
  data: AnalyticsData['models'];
}

const chartTooltipStyle = { backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' };

type DrawerState = { open: boolean; title: string; subtitle?: string; definition?: string; sections?: { label: string; value: string | number; highlight?: boolean }[]; actions?: { label: string; linkTo?: string; variant?: 'default' | 'outline' }[] };

const kpiRow1 = [
  { key: 'precision' as const, title: 'Precision', icon: <Target className="h-4 w-4" />, suffix: '%' },
  { key: 'recall' as const, title: 'Recall', icon: <Activity className="h-4 w-4" />, suffix: '%' },
  { key: 'f1' as const, title: 'F1 Score', icon: <Brain className="h-4 w-4" />, suffix: '%' },
  { key: 'auc' as const, title: 'AUC-ROC', icon: <BarChart3 className="h-4 w-4" />, suffix: '%' },
];

const kpiRow2 = [
  { key: 'featureDrift' as const, title: 'Feature Drift', icon: <Gauge className="h-4 w-4" />, suffix: '%' },
  { key: 'predictionDrift' as const, title: 'Prediction Drift', icon: <Gauge className="h-4 w-4" />, suffix: '%' },
  { key: 'dataQuality' as const, title: 'Data Quality', icon: <Database className="h-4 w-4" />, suffix: '%' },
  { key: 'latencyP50' as const, title: 'Latency P50', icon: <Clock className="h-4 w-4" /> },
];

const COLORS = ['hsl(var(--primary))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))'];

export function ModelsTab({ data }: ModelsTabProps) {
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: '' });
  const { toast } = useToast();

  const openKpiDrawer = (key: string) => {
    const kpi = data[key as keyof typeof data] as { value: number | string; delta: number; definition: string };
    const cfg = [...kpiRow1, ...kpiRow2].find(k => k.key === key)!;
    setDrawer({
      open: true, title: cfg.title, definition: kpi.definition,
      sections: [
        { label: 'Current Value', value: `${kpi.value}${cfg.suffix || ''}` },
        { label: 'Change', value: `${kpi.delta > 0 ? '+' : ''}${kpi.delta}%`, highlight: Math.abs(kpi.delta) > 3 },
        { label: 'Model Version', value: String(data.modelVersion.value) },
        { label: 'Latency P95', value: String(data.latencyP95.value) },
      ],
      actions: [{ label: 'View Model Details', linkTo: '/models' }],
    });
  };

  const renderKpiCard = (cfg: { key: string; title: string; icon: React.ReactNode; suffix?: string }, kpi: { value: number | string; delta: number }) => (
    <button key={cfg.key} onClick={() => openKpiDrawer(cfg.key)}
      className="flex flex-col gap-1 p-3 rounded-lg border border-border/50 bg-muted/20 hover-elevate text-left"
      data-testid={`kpi-${cfg.key}`}>
      <div className="flex items-center gap-2 text-muted-foreground">
        {cfg.icon}
        <span className="text-[10px] uppercase tracking-wider font-medium">{cfg.title}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold">{kpi.value}{typeof kpi.value === 'number' ? (cfg.suffix || '') : ''}</span>
        <Badge variant="secondary" className={cn("text-[9px]", kpi.delta > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
          {kpi.delta > 0 ? '+' : ''}{kpi.delta}%
        </Badge>
      </div>
    </button>
  );

  const cm = data.confusionMatrix;
  const cmTotal = cm.tp + cm.fp + cm.tn + cm.fn;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]" data-testid="badge-model-version">{String(data.modelVersion.value)}</Badge>
          <span className="text-xs text-muted-foreground">P95: {String(data.latencyP95.value)}</span>
        </div>
        <Button size="sm" variant="outline" data-testid="button-run-backtest"
          onClick={() => toast({ title: 'Backtest Queued', description: 'A backtest run has been submitted. Results will be available in ~15 minutes.' })}>
          <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
          Run Backtest
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiRow1.map(cfg => renderKpiCard(cfg, data[cfg.key]))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiRow2.map(cfg => renderKpiCard(cfg, data[cfg.key]))}
      </div>

      <div className="rounded-lg border border-border/50 p-4">
        <h3 className="text-sm font-semibold mb-3">Model Performance Comparison</h3>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.performanceComparison} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <RechartsTooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="precision" fill={COLORS[0]} radius={[2, 2, 0, 0]} />
              <Bar dataKey="recall" fill={COLORS[1]} radius={[2, 2, 0, 0]} />
              <Bar dataKey="f1" fill={COLORS[2]} radius={[2, 2, 0, 0]} />
              <Bar dataKey="auc" fill={COLORS[3]} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 p-4">
        <h3 className="text-sm font-semibold mb-1">Drift Trend</h3>
        <p className="text-[10px] text-muted-foreground mb-3">12-month feature & prediction drift with critical threshold</p>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.driftTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <RechartsTooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={3.0} stroke="hsl(var(--destructive))" strokeDasharray="6 3" label={{ value: 'Critical', position: 'right', fontSize: 10, fill: 'hsl(var(--destructive))' }} />
              <Area type="monotone" dataKey="featureDrift" name="Feature Drift" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.15} strokeWidth={2} />
              <Area type="monotone" dataKey="predictionDrift" name="Prediction Drift" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.15} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 p-4">
        <h3 className="text-sm font-semibold mb-3">Risk Score Distribution</h3>
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.scoreDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
              <RechartsTooltip contentStyle={chartTooltipStyle} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 p-4">
        <h3 className="text-sm font-semibold mb-3">Confusion Matrix</h3>
        <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
          {([
            { label: 'True Positive', key: 'tp' as const, color: 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
            { label: 'False Positive', key: 'fp' as const, color: 'bg-red-500/15 dark:bg-red-500/20 text-red-700 dark:text-red-300' },
            { label: 'False Negative', key: 'fn' as const, color: 'bg-red-500/15 dark:bg-red-500/20 text-red-700 dark:text-red-300' },
            { label: 'True Negative', key: 'tn' as const, color: 'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300' },
          ]).map(cell => (
            <div key={cell.key} className={cn("p-4 rounded-lg text-center", cell.color)} data-testid={`cm-${cell.key}`}>
              <p className="text-[10px] uppercase tracking-wider font-medium opacity-70">{cell.label}</p>
              <p className="text-2xl font-bold mt-1">{cm[cell.key].toLocaleString()}</p>
              <p className="text-[10px] mt-0.5 opacity-60">{((cm[cell.key] / cmTotal) * 100).toFixed(1)}%</p>
            </div>
          ))}
        </div>
      </div>

      <AnalyticsDrawer open={drawer.open} onOpenChange={(o) => setDrawer(s => ({ ...s, open: o }))}
        title={drawer.title} subtitle={drawer.subtitle} definition={drawer.definition}
        sections={drawer.sections} actions={drawer.actions} />
    </div>
  );
}
