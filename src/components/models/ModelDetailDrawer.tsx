import { useState } from 'react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertTriangle, CheckCircle2,
  ChevronRight, Cpu, Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import type { EnhancedMLModel, FeatureImportance, SegmentMetric, StabilityPoint, InferenceChannel } from '@/types/models';
import { useModelEvaluationQuery, useModelQuery } from '@/hooks/use-models-api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';

interface ModelDetailDrawerProps {
  model: EnhancedMLModel | null;
  open: boolean;
  onClose: () => void;
}

const stageBadgeVariant = (stage: string) => {
  switch (stage) {
    case 'production': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'staging': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'candidate': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'archived': return 'bg-muted text-muted-foreground border-border';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const MetricRow = ({ label, value, suffix = '', good }: { label: string; value: string | number; suffix?: string; good?: boolean }) => (
  <div className="flex items-center justify-between py-1.5">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className={`text-sm font-medium ${good === true ? 'text-emerald-600' : good === false ? 'text-red-500' : ''}`}>
      {value}{suffix}
    </span>
  </div>
);

export default function ModelDetailDrawer({ model, open, onClose }: ModelDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState('summary');
  const evaluationQuery = useModelEvaluationQuery(model?.id);
  // Hydrate full per-model detail (auditLog, approvalChain, versions) from
  // /api/models/:id — list responses ship with empty auditLog for payload size.
  const detailQuery = useModelQuery(model?.id);

  if (!model) return null;
  // Prefer the hydrated detail when available so the Governance tab shows the
  // real audit trail; fall back to the list-supplied row while loading.
  const fullModel: EnhancedMLModel = detailQuery.data ?? model;

  const featureImportance: FeatureImportance[] = evaluationQuery.data?.featureImportance ?? [];
  const segmentMetrics: SegmentMetric[] = evaluationQuery.data?.segmentMetrics ?? [];
  const stabilityTrend: StabilityPoint[] = evaluationQuery.data?.stabilityTrend ?? [];
  const inferenceByChannel: InferenceChannel[] = evaluationQuery.data?.inferenceByChannel ?? [];
  const evalLoading = evaluationQuery.isLoading;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-[680px] p-0 flex flex-col" data-testid="model-detail-drawer">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border flex-shrink-0">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Cpu className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg font-semibold">{model.name}</SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className={stageBadgeVariant(model.stage)}>
                  {model.stage.charAt(0).toUpperCase() + model.stage.slice(1)}
                </Badge>
                <span className="text-xs text-muted-foreground">v{model.version.replace('v', '')}</span>
                <span className="text-xs text-muted-foreground">|</span>
                <span className="text-xs text-muted-foreground">{model.purpose === 'both' ? 'Fraud + AML' : model.purpose.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-3 flex-shrink-0 grid grid-cols-5 h-9">
            <TabsTrigger value="summary" className="text-xs" data-testid="tab-summary">Summary</TabsTrigger>
            <TabsTrigger value="explainability" className="text-xs" data-testid="tab-explainability">Explain</TabsTrigger>
            <TabsTrigger value="operations" className="text-xs" data-testid="tab-operations">Ops</TabsTrigger>
            <TabsTrigger value="governance" className="text-xs" data-testid="tab-governance">Govern</TabsTrigger>
            <TabsTrigger value="evaluation" className="text-xs" data-testid="tab-evaluation">Eval</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-4">
              <TabsContent value="summary" className="mt-0 space-y-5">
                <SummaryTab model={model} />
              </TabsContent>
              <TabsContent value="explainability" className="mt-0 space-y-5">
                {evalLoading ? <EvalLoading /> : <ExplainabilityTab model={model} featureImportance={featureImportance} />}
              </TabsContent>
              <TabsContent value="operations" className="mt-0 space-y-5">
                {evalLoading ? <EvalLoading /> : <OperationsTab model={model} inferenceByChannel={inferenceByChannel} />}
              </TabsContent>
              <TabsContent value="governance" className="mt-0 space-y-5">
                {detailQuery.isLoading ? <EvalLoading /> : <GovernanceTab model={fullModel} />}
              </TabsContent>
              <TabsContent value="evaluation" className="mt-0 space-y-5">
                {evalLoading ? <EvalLoading /> : <EvaluationTab model={model} segmentMetrics={segmentMetrics} stabilityTrend={stabilityTrend} />}
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

function SummaryTab({ model }: { model: EnhancedMLModel }) {
  return (
    <>
      <Section title="Purpose & Objective">
        <p className="text-sm text-muted-foreground">{model.description}</p>
        <p className="text-sm text-muted-foreground mt-2 italic">{model.objective}</p>
      </Section>

      <Section title="Training Dataset">
        <MetricRow label="Dataset size" value={model.trainingDataSize.toLocaleString()} suffix=" samples" />
        <MetricRow label="Data window" value={model.dataWindow} />
        <MetricRow label="Label rate" value={(model.labelRate * 100).toFixed(1)} suffix="%" />
      </Section>

      <Section title="Features">
        <MetricRow label="Feature count" value={model.featuresUsed.length} />
        <div className="flex flex-wrap gap-1.5 mt-2">
          {model.featureGroups.map((g) => (
            <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
          ))}
        </div>
      </Section>

      <Section title="Segments">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Channels</p>
            <div className="flex flex-wrap gap-1">
              {model.primarySegments.channels.map((c) => (
                <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Countries</p>
            <div className="flex flex-wrap gap-1">
              {model.primarySegments.countries.map((c) => (
                <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Threshold & Risk Bands">
        <MetricRow label="Current threshold" value={model.threshold} />
        <div className="grid grid-cols-4 gap-2 mt-2">
          {(Object.entries(model.riskBandMapping) as [string, [number, number]][]).map(([band, [lo, hi]]) => (
            <div key={band} className="text-center p-2 rounded bg-muted/50">
              <p className="text-xs font-medium capitalize">{band}</p>
              <p className="text-xs text-muted-foreground">{lo} - {hi}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Current Metrics">
        <div className="grid grid-cols-2 gap-x-6">
          <MetricRow label="Precision" value={(model.metrics.precision * 100).toFixed(1)} suffix="%" good={model.metrics.precision > 0.85} />
          <MetricRow label="Recall" value={(model.metrics.recall * 100).toFixed(1)} suffix="%" good={model.metrics.recall > 0.80} />
          <MetricRow label="F1 Score" value={(model.metrics.f1Score * 100).toFixed(1)} suffix="%" />
          <MetricRow label="AUC-ROC" value={(model.metrics.aucRoc * 100).toFixed(1)} suffix="%" good={model.metrics.aucRoc > 0.90} />
          <MetricRow label="FPR" value={(model.metrics.falsePositiveRate * 100).toFixed(1)} suffix="%" good={model.metrics.falsePositiveRate < 0.05} />
          <MetricRow label="Latency p95" value={model.latencyP95} suffix="ms" good={model.latencyP95 < 50} />
        </div>
      </Section>

      <Section title="Version History">
        <div className="space-y-2">
          {model.versions.map((v) => (
            <div key={v.version} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">{v.version}</span>
                <Badge variant="outline" className={`text-[10px] ${stageBadgeVariant(v.stage)}`}>{v.stage}</Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>AUC {(v.metrics.aucRoc * 100).toFixed(1)}%</span>
                <span>{v.trainedAt.split('T')[0]}</span>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function EvalLoading() {
  return (
    <div className="flex items-center justify-center py-12 text-muted-foreground" data-testid="eval-loading">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function ExplainabilityTab({ model: _model, featureImportance }: { model: EnhancedMLModel; featureImportance: FeatureImportance[] }) {
  const chartData = featureImportance.map((f) => ({
    feature: f.feature.replace(/_/g, ' '),
    importance: +(f.importance * 100).toFixed(1),
    fill: f.direction === 'positive' ? 'hsl(var(--primary))' : 'hsl(var(--destructive))',
  }));

  const topDrivers = [
    'High velocity_6h signals driving 23% of critical alerts this week.',
    'Merchant risk score contributed to 18% of escalated cases.',
    'New device flag continues to be a strong positive indicator (9% contribution).',
    'Customer tenure acts as a protective signal, reducing scores for established accounts.',
  ];

  return (
    <>
      <Section title="Global Feature Importance">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} domain={[0, 'auto']} />
              <YAxis type="category" dataKey="feature" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} width={80} />
              <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary inline-block" /> Positive driver</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-destructive inline-block" /> Negative driver</span>
        </div>
      </Section>

      <Section title="Local Explanation Example">
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium">Flagged Transaction TXN-89234</span>
            <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600 border-red-500/20">Score: 0.91</Badge>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">velocity_6h = 12 (avg: 2.3)</span><span className="text-red-500 font-medium">+0.28</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">amount = $4,892 (avg: $245)</span><span className="text-red-500 font-medium">+0.22</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">is_new_device = true</span><span className="text-red-500 font-medium">+0.15</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">geo_distance = 2,340km</span><span className="text-red-500 font-medium">+0.12</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">customer_tenure = 4.2 years</span><span className="text-emerald-600 font-medium">-0.08</span></div>
          </div>
        </div>
      </Section>

      <Section title="Rule Hits vs Model Contribution">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <p className="text-2xl font-bold text-primary">62%</p>
            <p className="text-xs text-muted-foreground mt-1">Model-driven alerts</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/30 text-center">
            <p className="text-2xl font-bold">38%</p>
            <p className="text-xs text-muted-foreground mt-1">Rule-driven alerts</p>
          </div>
        </div>
      </Section>

      <Section title="Top Drivers This Week">
        <ul className="space-y-2">
          {topDrivers.map((d, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
              <ChevronRight className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
              {d}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}

function OperationsTab({ model, inferenceByChannel }: { model: EnhancedMLModel; inferenceByChannel: { channel: string; volume: number; pct: number }[] }) {
  return (
    <>
      <Section title="Latency & Reliability">
        <div className="grid grid-cols-2 gap-x-6">
          <MetricRow label="Latency p50" value={model.latencyP50} suffix="ms" good={model.latencyP50 < 20} />
          <MetricRow label="Latency p95" value={model.latencyP95} suffix="ms" good={model.latencyP95 < 50} />
          <MetricRow label="Error rate" value={(model.errorRate * 100).toFixed(2)} suffix="%" good={model.errorRate < 0.005} />
          <MetricRow label="Uptime" value={model.uptime.toFixed(2)} suffix="%" good={model.uptime > 99.9} />
          <MetricRow label="Throughput" value={model.throughput.toLocaleString()} suffix=" req/s" />
        </div>
      </Section>

      <Section title="Inference Volume by Channel">
        <div className="space-y-2">
          {inferenceByChannel.map((ch) => (
            <div key={ch.channel} className="flex items-center gap-3">
              <span className="text-sm w-16">{ch.channel}</span>
              <Progress value={ch.pct} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground w-20 text-right">{ch.volume.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Alert Performance">
        <div className="grid grid-cols-2 gap-x-6">
          <MetricRow label="Alerts generated" value={model.alertsGenerated.toLocaleString()} />
          <MetricRow label="Escalation rate" value={(model.escalationRate * 100).toFixed(0)} suffix="%" />
          <MetricRow label="Confirmed fraud rate" value={(model.confirmedFraudRate * 100).toFixed(0)} suffix="%" good={model.confirmedFraudRate > 0.40} />
          <MetricRow label="Alert yield" value={(model.alertYield * 100).toFixed(0)} suffix="%" good={model.alertYield > 0.50} />
        </div>
      </Section>
    </>
  );
}

function GovernanceTab({ model }: { model: EnhancedMLModel }) {
  return (
    <>
      <Section title="Model Card">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Objective</p>
            <p className="text-sm">{model.objective}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Limitations</p>
            <ul className="space-y-1">
              {model.limitations.map((l, i) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-amber-500 flex-shrink-0" />
                  {l}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Known Failure Modes</p>
            <ul className="space-y-1">
              {model.knownFailureModes.map((f, i) => (
                <li key={i} className="text-sm text-red-500/80 flex items-start gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Approval Chain">
        <div className="space-y-2">
          {model.approvalChain.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded bg-muted/30">
              <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{a.name}</p>
                <p className="text-xs text-muted-foreground">{a.role} — {a.action}</p>
              </div>
              <span className="text-xs text-muted-foreground">{a.date}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Audit Log">
        <div className="space-y-0">
          {model.auditLog.map((entry, i) => (
            <div key={entry.id} className="flex gap-3 pb-3 relative">
              {i < model.auditLog.length - 1 && (
                <div className="absolute left-[7px] top-6 bottom-0 w-[2px] bg-border" />
              )}
              <div className="h-4 w-4 rounded-full bg-primary/20 border-2 border-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{entry.action}</p>
                  <span className="text-xs text-muted-foreground">{format(new Date(entry.timestamp), 'MMM d, yyyy HH:mm')}</span>
                </div>
                <p className="text-xs text-muted-foreground">{entry.actor} — {entry.details}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function EvaluationTab({ model, segmentMetrics, stabilityTrend }: { model: EnhancedMLModel; segmentMetrics: SegmentMetric[]; stabilityTrend: { week: string; confidence: number; calibration: number }[] }) {
  return (
    <>
      <Section title="Metrics by Segment">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-xs font-medium text-muted-foreground">Segment</th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">Prec</th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">Rec</th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">F1</th>
                <th className="text-right py-2 text-xs font-medium text-muted-foreground">Vol</th>
              </tr>
            </thead>
            <tbody>
              {segmentMetrics.map((s) => (
                <tr key={s.segment} className="border-b border-border/50">
                  <td className="py-1.5 text-xs">{s.segment}</td>
                  <td className={`text-right py-1.5 text-xs font-mono ${s.precision >= 0.90 ? 'text-emerald-600' : s.precision < 0.85 ? 'text-amber-500' : ''}`}>{(s.precision * 100).toFixed(1)}%</td>
                  <td className={`text-right py-1.5 text-xs font-mono ${s.recall >= 0.85 ? 'text-emerald-600' : s.recall < 0.80 ? 'text-amber-500' : ''}`}>{(s.recall * 100).toFixed(1)}%</td>
                  <td className="text-right py-1.5 text-xs font-mono">{(s.f1Score * 100).toFixed(1)}%</td>
                  <td className="text-right py-1.5 text-xs font-mono text-muted-foreground">{(s.volume / 1000).toFixed(0)}K</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Stability Over Time">
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stabilityTrend} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis domain={[0.85, 1]} tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <Line type="monotone" dataKey="confidence" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="Confidence" />
              <Line type="monotone" dataKey="calibration" stroke="hsl(var(--chart-5))" strokeWidth={2} dot={false} name="Calibration" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-primary inline-block" /> Confidence</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: 'hsl(var(--chart-5))' }} /> Calibration</span>
        </div>
      </Section>

      <Section title="Threshold Simulator">
        <div className="p-3 rounded-lg bg-muted/30 border border-border">
          <p className="text-xs text-muted-foreground mb-3">Simulated impact of threshold changes on current production data (sandbox - no live impact).</p>
          <div className="space-y-2">
            {[
              { threshold: 0.40, precision: 0.82, recall: 0.94, fpr: 0.062, label: 'Aggressive' },
              { threshold: model.threshold, precision: model.metrics.precision, recall: model.metrics.recall, fpr: model.metrics.falsePositiveRate, label: 'Current' },
              { threshold: 0.70, precision: 0.95, recall: 0.72, fpr: 0.015, label: 'Conservative' },
            ].map((sim) => (
              <div key={sim.threshold} className={`flex items-center justify-between p-2 rounded text-xs ${sim.label === 'Current' ? 'bg-primary/5 border border-primary/20' : 'bg-muted/50'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono w-10">{sim.threshold}</span>
                  {sim.label === 'Current' && <Badge variant="outline" className="text-[10px]">Current</Badge>}
                  <span className="text-muted-foreground">{sim.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>P: {(sim.precision * 100).toFixed(0)}%</span>
                  <span>R: {(sim.recall * 100).toFixed(0)}%</span>
                  <span>FPR: {(sim.fpr * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-medium mb-3">{title}</h4>
      {children}
    </div>
  );
}
