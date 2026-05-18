import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { TrendingUp } from 'lucide-react';
import type { EnhancedMLModel } from '@/types/models';

interface CompareModelsProps {
  models: EnhancedMLModel[];
  open: boolean;
  onClose: () => void;
}

const stageBadgeClass = (stage: string) => {
  switch (stage) {
    case 'production': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'staging': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'candidate': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

export default function CompareModels({ models, open, onClose }: CompareModelsProps) {
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  };

  const selectedModels = models.filter((m) => selected.includes(m.id));
  const showComparison = selectedModels.length >= 2;

  const getRecommendation = () => {
    if (selectedModels.length < 2) return null;
    const best = [...selectedModels].sort((a, b) => {
      const scoreA = a.metrics.aucRoc * 0.3 + a.metrics.precision * 0.3 + a.metrics.recall * 0.2 + (1 - a.latencyP95 / 100) * 0.1 + (1 - a.driftScore) * 0.1;
      const scoreB = b.metrics.aucRoc * 0.3 + b.metrics.precision * 0.3 + b.metrics.recall * 0.2 + (1 - b.latencyP95 / 100) * 0.1 + (1 - b.driftScore) * 0.1;
      return scoreB - scoreA;
    });
    const top = best[0];
    const runner = best[1];
    const advantages: string[] = [];
    if (top.metrics.precision > runner.metrics.precision) advantages.push('precision');
    if (top.latencyP95 < runner.latencyP95) advantages.push('latency');
    if (top.metrics.aucRoc > runner.metrics.aucRoc) advantages.push('AUC');
    if (top.driftScore < runner.driftScore) advantages.push('drift stability');

    const weaknesses: string[] = [];
    if (top.metrics.recall < runner.metrics.recall) weaknesses.push(`lower recall than ${runner.name.split(' ')[0]}`);
    if (top.latencyP95 > runner.latencyP95) weaknesses.push(`higher latency than ${runner.name.split(' ')[0]}`);

    return {
      model: top,
      advantages,
      weaknesses,
      summary: `${top.name} leads on ${advantages.join(' and ')}${weaknesses.length > 0 ? `, but has ${weaknesses.join(' and ')}` : ''}.`,
    };
  };

  const recommendation = showComparison ? getRecommendation() : null;

  const metrics = [
    { key: 'Precision', fn: (m: EnhancedMLModel) => (m.metrics.precision * 100).toFixed(1) + '%', higher: true },
    { key: 'Recall', fn: (m: EnhancedMLModel) => (m.metrics.recall * 100).toFixed(1) + '%', higher: true },
    { key: 'F1 Score', fn: (m: EnhancedMLModel) => (m.metrics.f1Score * 100).toFixed(1) + '%', higher: true },
    { key: 'AUC-ROC', fn: (m: EnhancedMLModel) => (m.metrics.aucRoc * 100).toFixed(1) + '%', higher: true },
    { key: 'FPR', fn: (m: EnhancedMLModel) => (m.metrics.falsePositiveRate * 100).toFixed(1) + '%', higher: false },
    { key: 'Latency p95', fn: (m: EnhancedMLModel) => m.latencyP95 + 'ms', higher: false },
    { key: 'Throughput', fn: (m: EnhancedMLModel) => m.throughput.toLocaleString() + '/s', higher: true },
    { key: 'Drift Score', fn: (m: EnhancedMLModel) => m.driftScore.toFixed(2), higher: false },
    { key: 'Alert Yield', fn: (m: EnhancedMLModel) => (m.alertYield * 100).toFixed(0) + '%', higher: true },
    { key: 'Uptime', fn: (m: EnhancedMLModel) => m.uptime.toFixed(2) + '%', higher: true },
  ];

  const bestValue = (metricFn: (m: EnhancedMLModel) => string, higher: boolean) => {
    if (selectedModels.length < 2) return '';
    const vals = selectedModels.map((m) => parseFloat(metricFn(m)));
    const best = higher ? Math.max(...vals) : Math.min(...vals);
    const idx = vals.indexOf(best);
    return selectedModels[idx]?.id || '';
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[800px] max-h-[85vh]" data-testid="compare-models-dialog">
        <DialogHeader>
          <DialogTitle>Compare Models</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Select 2-3 models to compare side by side.</p>

        <ScrollArea className="max-h-[calc(85vh-140px)]">
          <div className="space-y-6 pr-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {models.filter((m) => m.stage !== 'retired').map((m) => (
                <label
                  key={m.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selected.includes(m.id) ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  } ${!selected.includes(m.id) && selected.length >= 3 ? 'opacity-50 cursor-not-allowed' : ''}`}
                  data-testid={`compare-select-${m.id}`}
                >
                  <Checkbox
                    checked={selected.includes(m.id)}
                    onCheckedChange={() => toggle(m.id)}
                    disabled={!selected.includes(m.id) && selected.length >= 3}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Badge variant="outline" className={`text-[10px] ${stageBadgeClass(m.stage)}`}>{m.stage}</Badge>
                      <span className="text-xs text-muted-foreground">{m.version}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {showComparison && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-xs font-medium text-muted-foreground w-28">Metric</th>
                        {selectedModels.map((m) => (
                          <th key={m.id} className="text-center py-2 text-xs font-medium w-32">
                            <span className="truncate block">{m.name.split(' ')[0]}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((metric) => {
                        const bestId = bestValue(metric.fn, metric.higher);
                        return (
                          <tr key={metric.key} className="border-b border-border/50">
                            <td className="py-1.5 text-xs text-muted-foreground">{metric.key}</td>
                            {selectedModels.map((m) => (
                              <td key={m.id} className={`text-center py-1.5 text-xs font-mono ${m.id === bestId ? 'text-emerald-600 font-semibold' : ''}`}>
                                {metric.fn(m)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 text-xs font-medium text-muted-foreground w-28">Business Impact</th>
                        {selectedModels.map((m) => (
                          <th key={m.id} className="text-center py-2 text-xs font-medium w-32">
                            {m.name.split(' ')[0]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border/50">
                        <td className="py-1.5 text-xs text-muted-foreground">Alerts generated</td>
                        {selectedModels.map((m) => <td key={m.id} className="text-center py-1.5 text-xs font-mono">{m.alertsGenerated.toLocaleString()}</td>)}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-1.5 text-xs text-muted-foreground">Confirmed fraud %</td>
                        {selectedModels.map((m) => <td key={m.id} className="text-center py-1.5 text-xs font-mono">{(m.confirmedFraudRate * 100).toFixed(0)}%</td>)}
                      </tr>
                      <tr className="border-b border-border/50">
                        <td className="py-1.5 text-xs text-muted-foreground">Inference volume</td>
                        {selectedModels.map((m) => <td key={m.id} className="text-center py-1.5 text-xs font-mono">{(m.inferenceVolume / 1000).toFixed(0)}K</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>

                {recommendation && (
                  <div className="p-4 rounded-lg border border-primary/20 bg-primary/5">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Analysis</span>
                    </div>
                    <p className="text-sm text-muted-foreground">{recommendation.summary}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
