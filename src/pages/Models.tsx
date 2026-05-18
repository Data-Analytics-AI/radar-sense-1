import { useState, useMemo } from 'react';
import {
  Brain, RefreshCw, ArrowUpCircle, RotateCcw, FileText,
  Activity, Shield, AlertTriangle, CheckCircle2,
  Search, TrendingUp, TrendingDown, Cpu,
  BarChart3, Eye, GitCompare, ChevronRight, Info, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend,
  Tooltip as RTooltip,
} from 'recharts';
import { useToast } from '@/hooks/use-toast';
import {
  useModelsQuery, useModelDashboardQuery,
  usePromoteModel, useRollbackModel, useThresholdModel,
} from '@/hooks/use-models-api';
import type { EnhancedMLModel } from '@/types/models';
import ModelDetailDrawer from '@/components/models/ModelDetailDrawer';
import RetrainWizard from '@/components/models/RetrainWizard';
import CompareModels from '@/components/models/CompareModels';
import ConfirmActionDialog from '@/components/models/ConfirmActionDialog';
import { usePermissions } from '@/hooks/usePermissions';

const stageBadge = (stage: string) => {
  switch (stage) {
    case 'production': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'staging': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'candidate': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'archived': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const healthBadge = (status: string) => {
  switch (status) {
    case 'healthy': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'degraded': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'investigate': return 'bg-red-500/10 text-red-600 border-red-500/20';
    default: return '';
  }
};

const KPICard = ({ label, value, suffix, tooltip, trend }: { label: string; value: string | number; suffix?: string; tooltip: string; trend?: 'up' | 'down' | 'stable' }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50 cursor-default" data-testid={`kpi-${label.toLowerCase().replace(/\s/g, '-')}`}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            {trend === 'up' && <TrendingUp className="h-3 w-3 text-emerald-500" />}
            {trend === 'down' && <TrendingDown className="h-3 w-3 text-red-500" />}
          </div>
          <p className="text-lg font-bold">{value}{suffix}</p>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-[200px]"><p className="text-xs">{tooltip}</p></TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export default function Models() {
  const { toast } = useToast();
  const modelsQuery = useModelsQuery();
  const dashboardQuery = useModelDashboardQuery();
  const promoteMutation = usePromoteModel();
  const rollbackMutation = useRollbackModel();
  const thresholdMutation = useThresholdModel();

  const models = modelsQuery.data ?? [];
  const productionModel = dashboardQuery.data?.productionModel;
  const evaluation = dashboardQuery.data?.evaluation;

  const { can, roles } = usePermissions();
  // Admin is treated as superuser by `can`. Non-admin role checks map to the
  // canonical permission keys (`deploy_models` covers promote/rollback/threshold;
  // `retrain_models` covers retrain). `view_models` gates the registry tab if used.
  const canPromote = can('deploy_models');
  const canRollback = can('deploy_models');
  const canRetrain = can('retrain_models');

  const [drawerModel, setDrawerModel] = useState<EnhancedMLModel | null>(null);
  const [retrainOpen, setRetrainOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ action: 'promote' | 'rollback' | 'threshold'; model: EnhancedMLModel } | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('stage');

  const filteredModels = useMemo(() => {
    let list = [...models];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.name.toLowerCase().includes(q) || m.version.toLowerCase().includes(q) || m.type.includes(q));
    }
    if (filterType !== 'all') list = list.filter((m) => m.category === filterType);
    if (filterStage !== 'all') list = list.filter((m) => m.stage === filterStage);

    list.sort((a, b) => {
      switch (sortBy) {
        case 'trained': return new Date(b.trainedAt).getTime() - new Date(a.trainedAt).getTime();
        case 'auc': return b.metrics.aucRoc - a.metrics.aucRoc;
        case 'drift': return b.driftScore - a.driftScore;
        case 'latency': return a.latencyP95 - b.latencyP95;
        default: {
          const order: Record<string, number> = { production: 0, staging: 1, candidate: 2, archived: 3, retired: 4 };
          return (order[a.stage] ?? 5) - (order[b.stage] ?? 5);
        }
      }
    });
    return list;
  }, [models, searchQuery, filterType, filterStage, sortBy]);

  const isLoading = modelsQuery.isLoading || dashboardQuery.isLoading;
  const error = modelsQuery.error || dashboardQuery.error;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24" data-testid="models-loading">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !productionModel || !evaluation) {
    return (
      <div className="stat-card text-center py-12" data-testid="models-error">
        <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-500" />
        <p className="text-sm text-muted-foreground">
          {(error as Error | undefined)?.message || 'No production model registered.'}
        </p>
      </div>
    );
  }

  const handleConfirm = ({ reason, threshold }: { reason: string; threshold?: number }) => {
    if (!confirmAction) return;
    const { action, model } = confirmAction;
    const onSuccess = () => {
      toast({ title: `${action.charAt(0).toUpperCase() + action.slice(1)} complete`, description: model.name });
      setConfirmAction(null);
    };
    const onError = (err: unknown) => {
      toast({ variant: 'destructive', title: `${action} failed`, description: (err as Error).message });
    };
    if (action === 'promote') promoteMutation.mutate({ id: model.id, reason }, { onSuccess, onError });
    else if (action === 'rollback') rollbackMutation.mutate({ id: model.id, reason }, { onSuccess, onError });
    else if (action === 'threshold' && threshold !== undefined) thresholdMutation.mutate({ id: model.id, threshold, reason }, { onSuccess, onError });
  };

  const isActionPending = promoteMutation.isPending || rollbackMutation.isPending || thresholdMutation.isPending;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <Brain className="h-6 w-6 text-primary" />
            Model Performance
          </h1>
          <p className="text-muted-foreground text-sm">Monitor, compare, and manage ML models</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">{(roles[0] ?? 'viewer').replace('_', ' ')}</Badge>
          {canRetrain && (
            <Button variant="outline" onClick={() => setRetrainOpen(true)} data-testid="button-retrain">
              <RefreshCw className="h-4 w-4 mr-2" /> Retrain
            </Button>
          )}
          <Button variant="outline" onClick={() => setCompareOpen(true)} data-testid="button-compare">
            <GitCompare className="h-4 w-4 mr-2" /> Compare
          </Button>
        </div>
      </div>

      {/* A) Production Model Control Bar */}
      <section className="stat-card border-primary/30 bg-gradient-to-r from-primary/5 to-transparent" data-testid="section-production-overview">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Cpu className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg flex items-center gap-2 flex-wrap" data-testid="text-production-model-name">
                {productionModel.name}
                <Badge variant="outline" className={stageBadge('production')}>Production</Badge>
                <Badge variant="outline" className={healthBadge(productionModel.healthStatus)}>
                  {productionModel.healthStatus === 'healthy' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                  {productionModel.healthStatus === 'degraded' && <AlertTriangle className="h-3 w-3 mr-1" />}
                  {productionModel.healthStatus.charAt(0).toUpperCase() + productionModel.healthStatus.slice(1)}
                </Badge>
              </h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-0.5">
                <span>v{productionModel.version.replace('v', '')}</span>
                {productionModel.lastDeployed && <span>Deployed {format(new Date(productionModel.lastDeployed), 'MMM d, yyyy')}</span>}
                <span>Trained {format(new Date(productionModel.trainedAt), 'MMM d, yyyy')}</span>
                <span>Data: {productionModel.dataWindow}</span>
                <span>Owner: {productionModel.owner}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            {canRollback && (
              <Button variant="outline" size="sm" onClick={() => setConfirmAction({ action: 'rollback', model: productionModel })} data-testid="button-rollback">
                <RotateCcw className="h-4 w-4 mr-1" /> Rollback
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setDrawerModel(productionModel)} data-testid="button-view-audit">
              <FileText className="h-4 w-4 mr-1" /> Audit Trail
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <KPICard label="Precision" value={(productionModel.metrics.precision * 100).toFixed(1)} suffix="%" tooltip="Fraction of flagged transactions that are actual fraud" trend="up" />
          <KPICard label="Recall" value={(productionModel.metrics.recall * 100).toFixed(1)} suffix="%" tooltip="Fraction of actual fraud successfully detected" trend="stable" />
          <KPICard label="F1" value={(productionModel.metrics.f1Score * 100).toFixed(1)} suffix="%" tooltip="Harmonic mean of precision and recall" />
          <KPICard label="AUC" value={(productionModel.metrics.aucRoc * 100).toFixed(1)} suffix="%" tooltip="Area under the ROC curve; measures overall discrimination" trend="up" />
          <KPICard label="Latency p95" value={productionModel.latencyP95} suffix="ms" tooltip="95th percentile inference latency" trend="stable" />
          <KPICard label="Throughput" value={(productionModel.throughput / 1000).toFixed(1)} suffix="K/s" tooltip="Requests processed per second" />
          <KPICard label="Drift" value={productionModel.driftScore.toFixed(2)} tooltip="Population Stability Index across key features" trend="down" />
          <KPICard label="Alert Yield" value={(productionModel.alertYield * 100).toFixed(0)} suffix="%" tooltip="Fraction of alerts that result in actionable findings" trend="up" />
        </div>
      </section>

      {/* B) Performance & Risk Impact */}
      <section data-testid="section-performance">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" /> Performance & Risk Impact
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Detection vs False Positives (30d)</h4>
              <Badge variant="outline" className="text-[10px]">30-day window</Badge>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={evaluation.detectionTrend} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval={4} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                  <Area type="monotone" dataKey="detections" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} name="Detections" />
                  <Area type="monotone" dataKey="falsePositives" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.1} strokeWidth={2} name="False Positives" />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Loss Prevented vs Actual Loss</h4>
              <Badge variant="outline" className="text-[10px]">8-month</Badge>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evaluation.lossTrend} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} formatter={(v: number) => [`$${v.toLocaleString()}`, '']} />
                  <Bar dataKey="prevented" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Prevented" />
                  <Bar dataKey="actual" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} name="Actual Loss" />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Precision/Recall Trade-off</h4>
              <Badge variant="outline" className="text-[10px]">Threshold sensitivity</Badge>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evaluation.precisionRecallCurve} margin={{ left: 0, right: 0, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="threshold" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} label={{ value: 'Threshold', position: 'bottom', fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} domain={[0, 1]} />
                  <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }} />
                  <Line type="monotone" dataKey="precision" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Precision" />
                  <Line type="monotone" dataKey="recall" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} name="Recall" />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="stat-card">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-medium">Confusion Matrix & Score Distribution</h4>
              <Badge variant="outline" className="text-[10px]">Current threshold</Badge>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="grid grid-cols-2 gap-1 text-center text-xs">
                  <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <p className="font-bold text-emerald-600 text-lg">{evaluation.confusionMatrix.truePositive.toLocaleString()}</p>
                    <p className="text-muted-foreground">True Pos</p>
                  </div>
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/20">
                    <p className="font-bold text-red-500 text-lg">{evaluation.confusionMatrix.falsePositive.toLocaleString()}</p>
                    <p className="text-muted-foreground">False Pos</p>
                  </div>
                  <div className="p-3 rounded bg-amber-500/10 border border-amber-500/20">
                    <p className="font-bold text-amber-600 text-lg">{evaluation.confusionMatrix.falseNegative.toLocaleString()}</p>
                    <p className="text-muted-foreground">False Neg</p>
                  </div>
                  <div className="p-3 rounded bg-emerald-500/10 border border-emerald-500/20">
                    <p className="font-bold text-emerald-600 text-lg">{(evaluation.confusionMatrix.trueNegative / 1000).toFixed(1)}K</p>
                    <p className="text-muted-foreground">True Neg</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Score by Risk Band</p>
                <div className="space-y-1.5">
                  {evaluation.scoreDistribution.map((band) => (
                    <div key={band.band} className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-24 truncate">{band.band}</span>
                      <Progress value={band.pct} className="h-2 flex-1" />
                      <span className="text-[10px] font-mono w-10 text-right">{band.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* C) Drift, Data Quality & Monitoring */}
      <section data-testid="section-drift-monitoring">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" /> Drift, Data Quality & Monitoring
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="stat-card lg:col-span-1">
            <h4 className="text-sm font-medium mb-3">Feature Drift (Top 10)</h4>
            <div className="space-y-2">
              {evaluation.featureDrift.map((f) => (
                <div key={f.feature} className="flex items-center gap-2">
                  <span className="text-xs w-28 truncate text-muted-foreground">{f.feature.replace(/_/g, ' ')}</span>
                  <Progress value={Math.min(f.psi * 500, 100)} className={cn('h-2 flex-1', f.status === 'critical' ? '[&>div]:bg-red-500' : f.status === 'warning' ? '[&>div]:bg-amber-500' : '')} />
                  <span className={cn('text-[10px] font-mono w-8 text-right', f.status === 'critical' ? 'text-red-500' : f.status === 'warning' ? 'text-amber-500' : 'text-muted-foreground')}>
                    {f.psi.toFixed(2)}
                  </span>
                  <div className={cn('h-2 w-2 rounded-full flex-shrink-0', f.status === 'critical' ? 'bg-red-500' : f.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500')} />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">PSI {'>'} 0.2 = critical, 0.1-0.2 = warning</p>
          </div>

          <div className="stat-card lg:col-span-1">
            <h4 className="text-sm font-medium mb-3">Data Quality Checks</h4>
            <div className="space-y-2">
              {evaluation.dataQuality.map((dq) => (
                <div key={dq.metric} className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{dq.metric}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono">{typeof dq.value === 'number' && dq.value % 1 !== 0 ? dq.value.toFixed(1) : dq.value}</span>
                    <div className={cn('h-2 w-2 rounded-full', dq.status === 'pass' ? 'bg-emerald-500' : dq.status === 'warning' ? 'bg-amber-500' : 'bg-red-500')} />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-3 border-t border-border">
              <h4 className="text-sm font-medium mb-2">Model Stability</h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Weekly confidence change</span><span className="font-mono">-0.3%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Calibration shift</span><span className="font-mono text-amber-500">+1.2%</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Segment degradation</span><span className="font-mono text-amber-500">Cross-border Web</span></div>
              </div>
            </div>
          </div>

          <div className="stat-card lg:col-span-1">
            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" /> What Changed?
            </h4>
            <ul className="space-y-3">
              {evaluation.whatChanged.map((insight, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground leading-relaxed">
                  <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-primary flex-shrink-0" />
                  {insight}
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border">Updated {format(new Date(evaluation.generatedAt), 'MMM d, HH:mm')}</p>
          </div>
        </div>
      </section>

      {/* D) Model Registry */}
      <section data-testid="section-model-registry">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Model Registry
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-8 w-48 text-sm"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-models"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-8 w-32 text-xs" data-testid="filter-model-type">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="supervised">Supervised</SelectItem>
                <SelectItem value="anomaly">Anomaly</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStage} onValueChange={setFilterStage}>
              <SelectTrigger className="h-8 w-32 text-xs" data-testid="filter-model-stage">
                <SelectValue placeholder="Stage" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="candidate">Candidate</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="h-8 w-32 text-xs" data-testid="sort-models">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="stage">Stage</SelectItem>
                <SelectItem value="trained">Last Trained</SelectItem>
                <SelectItem value="auc">AUC</SelectItem>
                <SelectItem value="drift">Drift</SelectItem>
                <SelectItem value="latency">Latency</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredModels.map((model) => (
            <div
              key={model.id}
              className={cn(
                'stat-card cursor-pointer transition-all hover:border-primary/30 hover:shadow-md group',
                model.stage === 'production' && 'border-primary/20'
              )}
              onClick={() => setDrawerModel(model)}
              data-testid={`card-model-${model.id}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0', model.stage === 'production' ? 'bg-primary/10' : 'bg-muted')}>
                    <Cpu className={cn('h-4 w-4', model.stage === 'production' ? 'text-primary' : 'text-muted-foreground')} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                      <span className="truncate">{model.name}</span>
                      <Badge variant="outline" className={cn('text-[10px]', stageBadge(model.stage))}>
                        {model.stage}
                      </Badge>
                      {model.healthStatus !== 'healthy' && (
                        <Badge variant="outline" className={cn('text-[10px]', healthBadge(model.healthStatus))}>
                          {model.healthStatus}
                        </Badge>
                      )}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {model.version} | {model.category} | {model.purpose === 'both' ? 'Fraud+AML' : model.purpose.toUpperCase()} | Owner: {model.owner}
                    </p>
                  </div>
                </div>
                <Eye className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-1" />
              </div>

              <div className="grid grid-cols-4 gap-3 text-center">
                <div>
                  <p className="text-[10px] text-muted-foreground">Precision</p>
                  <p className="text-sm font-bold">{(model.metrics.precision * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Recall</p>
                  <p className="text-sm font-bold">{(model.metrics.recall * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">AUC</p>
                  <p className="text-sm font-bold">{(model.metrics.aucRoc * 100).toFixed(0)}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Latency</p>
                  <p className="text-sm font-bold">{model.latencyP95}ms</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-muted-foreground mt-3 pt-2 border-t border-border/50">
                <span>Trained {format(new Date(model.trainedAt), 'MMM d, yyyy')}</span>
                <span>{model.featuresUsed.length} features | {model.trainingDataSize.toLocaleString()} samples</span>
                <span>Drift: {model.driftScore.toFixed(2)}</span>
              </div>

              {model.stage !== 'production' && model.stage !== 'archived' && model.stage !== 'retired' && canPromote && (
                <div className="mt-3 pt-2 border-t border-border/50 flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => { e.stopPropagation(); setConfirmAction({ action: 'promote', model }); }}
                    data-testid={`button-promote-${model.id}`}
                  >
                    <ArrowUpCircle className="h-4 w-4 mr-1" /> Promote to production
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredModels.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No models match your filters.</p>
          </div>
        )}
      </section>

      {/* Dialogs & Drawers */}
      <ModelDetailDrawer model={drawerModel} open={!!drawerModel} onClose={() => setDrawerModel(null)} />
      <RetrainWizard open={retrainOpen} onClose={() => setRetrainOpen(false)} />
      <CompareModels models={models} open={compareOpen} onClose={() => setCompareOpen(false)} />
      {confirmAction && (
        <ConfirmActionDialog
          open={true}
          onClose={() => !isActionPending && setConfirmAction(null)}
          action={confirmAction.action}
          modelName={confirmAction.model.name}
          initialThreshold={confirmAction.action === 'threshold' ? confirmAction.model.threshold : undefined}
          isPending={isActionPending}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
