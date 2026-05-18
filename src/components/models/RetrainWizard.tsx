import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useRetrainModel } from '@/hooks/use-models-api';

interface RetrainWizardProps {
  open: boolean;
  onClose: () => void;
  sourceModelId?: string;
}

const steps = [
  { id: 1, title: 'Model Family' },
  { id: 2, title: 'Training Data' },
  { id: 3, title: 'Feature Set' },
  { id: 4, title: 'Validation Plan' },
  { id: 5, title: 'Evaluation Gates' },
  { id: 6, title: 'Review & Submit' },
];

export default function RetrainWizard({ open, onClose, sourceModelId }: RetrainWizardProps) {
  const { toast } = useToast();
  const retrain = useRetrainModel();
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState({
    modelFamily: '',
    trainingWindow: '6months',
    labelSource: 'confirmed_investigations',
    featureSetVersion: 'v2_production',
    validationStrategy: 'time_split',
    kFolds: '5',
    minPrecision: '0.85',
    maxFPR: '0.05',
    maxLatencyP95: '50',
    reason: '',
  });

  const update = (key: string, value: string) => setConfig((c) => ({ ...c, [key]: value }));

  const handleSubmit = () => {
    retrain.mutate(
      { ...config, sourceModelId },
      {
        onSuccess: (data: unknown) => {
          const created = data as { id?: string; name?: string };
          toast({
            title: 'Retrain candidate registered',
            description: `${created.name ?? config.modelFamily} (${created.id ?? 'new'}) added to the registry.`,
          });
          setStep(1);
          setConfig((c) => ({ ...c, reason: '' }));
          onClose();
        },
        onError: (err: Error) => {
          toast({ title: 'Retrain failed', description: err.message, variant: 'destructive' });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !retrain.isPending && onClose()}>
      <DialogContent className="sm:max-w-[560px]" data-testid="retrain-wizard">
        <DialogHeader>
          <DialogTitle>Retrain Model</DialogTitle>
          <div className="flex items-center gap-1 mt-3">
            {steps.map((s) => (
              <div key={s.id} className="flex items-center gap-1 flex-1">
                <div className={`h-1.5 rounded-full flex-1 ${step >= s.id ? 'bg-primary' : 'bg-muted'}`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Step {step} of {steps.length}: {steps[step - 1].title}</p>
        </DialogHeader>

        <div className="py-4 min-h-[200px]">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <Label>Model Family</Label>
                <Select value={config.modelFamily} onValueChange={(v) => update('modelFamily', v)}>
                  <SelectTrigger data-testid="select-model-family"><SelectValue placeholder="Choose model type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="xgboost">XGBoost</SelectItem>
                    <SelectItem value="random_forest">Random Forest</SelectItem>
                    <SelectItem value="logistic_regression">Logistic Regression</SelectItem>
                    <SelectItem value="isolation_forest">Isolation Forest</SelectItem>
                    <SelectItem value="autoencoder">Neural Network Ensemble</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>Training Window</Label>
                <Select value={config.trainingWindow} onValueChange={(v) => update('trainingWindow', v)}>
                  <SelectTrigger data-testid="select-training-window"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3months">Last 3 months</SelectItem>
                    <SelectItem value="6months">Last 6 months</SelectItem>
                    <SelectItem value="12months">Last 12 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Label Source</Label>
                <Select value={config.labelSource} onValueChange={(v) => update('labelSource', v)}>
                  <SelectTrigger data-testid="select-label-source"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed_investigations">Confirmed investigations</SelectItem>
                    <SelectItem value="all_dispositions">All alert dispositions</SelectItem>
                    <SelectItem value="sar_filed">SAR-filed cases only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <Label>Feature Set Version</Label>
                <Select value={config.featureSetVersion} onValueChange={(v) => update('featureSetVersion', v)}>
                  <SelectTrigger data-testid="select-feature-set"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="v1_baseline">v1 Baseline (6 features)</SelectItem>
                    <SelectItem value="v2_production">v2 Production (15 features)</SelectItem>
                    <SelectItem value="v3_experimental">v3 Experimental (18 features, incl. embeddings)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 rounded bg-muted/50 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">v2 Production includes:</p>
                <p>amount, velocity_1h/6h/24h, geo_distance, time_of_day, day_of_week, is_new_device, is_new_ip, merchant_risk, device_age, customer_tenure, avg_amount_30d, stddev_amount_30d, channel_frequency</p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <Label>Validation Strategy</Label>
                <Select value={config.validationStrategy} onValueChange={(v) => update('validationStrategy', v)}>
                  <SelectTrigger data-testid="select-validation"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="time_split">Time-based split (80/20)</SelectItem>
                    <SelectItem value="kfold">K-fold cross-validation</SelectItem>
                    <SelectItem value="stratified">Stratified k-fold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {config.validationStrategy.includes('fold') && (
                <div>
                  <Label>Number of folds</Label>
                  <Input type="number" value={config.kFolds} onChange={(e) => update('kFolds', e.target.value)} data-testid="input-kfolds" />
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Set minimum thresholds the candidate model must pass before registration.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Min Precision</Label>
                  <Input type="number" step="0.01" value={config.minPrecision} onChange={(e) => update('minPrecision', e.target.value)} data-testid="input-min-precision" />
                </div>
                <div>
                  <Label>Max FPR</Label>
                  <Input type="number" step="0.01" value={config.maxFPR} onChange={(e) => update('maxFPR', e.target.value)} data-testid="input-max-fpr" />
                </div>
                <div>
                  <Label>Max Latency p95 (ms)</Label>
                  <Input type="number" value={config.maxLatencyP95} onChange={(e) => update('maxLatencyP95', e.target.value)} data-testid="input-max-latency" />
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <p className="text-sm font-medium">Review Configuration</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Model family</span><span>{config.modelFamily || 'Not selected'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Training window</span><span>{config.trainingWindow}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Label source</span><span>{config.labelSource.replace(/_/g, ' ')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Feature set</span><span>{config.featureSetVersion}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Validation</span><span>{config.validationStrategy.replace(/_/g, ' ')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Min precision</span><span>{config.minPrecision}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Max FPR</span><span>{config.maxFPR}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Max latency p95</span><span>{config.maxLatencyP95}ms</span></div>
              </div>
              <div>
                <Label>Reason for retraining</Label>
                <Textarea placeholder="Describe why this retrain is needed..." value={config.reason} onChange={(e) => update('reason', e.target.value)} data-testid="input-retrain-reason" />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} data-testid="button-wizard-back" disabled={retrain.isPending}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back
              </Button>
            )}
          </div>
          <div>
            {step < 6 ? (
              <Button onClick={() => setStep((s) => s + 1)} data-testid="button-wizard-next">
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={retrain.isPending || !config.modelFamily || !config.reason.trim()} data-testid="button-submit-retrain">
                {retrain.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...</> : <><CheckCircle2 className="h-4 w-4 mr-2" /> Submit Retrain Job</>}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
