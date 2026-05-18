import { useState, useCallback, useEffect } from 'react';
import {
  Settings as SettingsIcon, ChevronRight, Save, RotateCcw, AlertTriangle,
  CheckCircle2, XCircle, Eye, EyeOff, Plus, Trash2, Play, Zap, Info,
  Clock, Search, ChevronDown, ExternalLink, Copy, RefreshCw, Download,
  Server, Wifi, WifiOff, ShieldCheck, ShieldAlert, TrendingUp, Users,
  Activity, Lock,
  type LucideIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import {
  SETTINGS_SECTIONS, DEFAULT_SETTINGS, deepClone, formatTimestamp,
  createAuditEntry,
  type SettingsSectionId, type AllSettings, type AuditEntry,
  type SettingsSectionConfig,
} from '@/lib/settings-data';

function MaskedInput({ value, onChange, placeholder, className }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="relative">
      <Input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        data-testid="input-masked"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
        onClick={() => setRevealed(!revealed)}
        data-testid="button-toggle-reveal"
      >
        {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

interface ProviderInfo {
  id: string;
  label: string;
  defaultModel: string;
  modelHelp: string;
  requiredCreds: { key: string; label: string; placeholder?: string; secret: boolean; help?: string; optional?: boolean; default?: string }[];
}
interface ActivePublic {
  providerId: string;
  providerLabel: string;
  model: string;
  temperature: number;
  maxTokens: number;
  promptVersion: string;
  isCustom: boolean;
  credsMasked: Record<string, string>;
}
interface ConfigPayload {
  active: ActivePublic | null;
  default: ActivePublic | null;
  providers: ProviderInfo[];
}

interface AIAssistantLiveConfigProps {
  promptVersion: string;
  onPromptVersionChange: (v: string) => void;
  ragEnabled: boolean;
  onRagEnabledChange: (v: boolean) => void;
}

function AIAssistantLiveConfig({
  promptVersion,
  onPromptVersionChange,
  ragEnabled,
  onRagEnabledChange,
}: AIAssistantLiveConfigProps) {
  const { toast } = useToast();
  const [data, setData] = useState<ConfigPayload | null>(null);
  const [providerId, setProviderId] = useState<string>('azure-openai');
  const [model, setModel] = useState<string>('');
  const [temperature, setTemperature] = useState<number>(0.3);
  const [maxTokens, setMaxTokens] = useState<number>(4096);
  const [creds, setCreds] = useState<Record<string, string>>({});
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  const loadConfig = useCallback(async () => {
    try {
      const r = await fetch('/api/ai/config');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const json = (await r.json()) as ConfigPayload;
      setData(json);
      const active = json.active;
      if (active) {
        setProviderId(active.providerId);
        setModel(active.model);
        setTemperature(active.temperature);
        setMaxTokens(active.maxTokens);
        setCreds({});
      }
    } catch (e) {
      toast({ title: 'Failed to load AI config', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const provider = data?.providers.find(p => p.id === providerId);
  const isActiveProvider = data?.active?.providerId === providerId;

  // When switching provider: reset model to provider default, clear creds + test status.
  const handleProviderChange = (v: string) => {
    setProviderId(v);
    const p = data?.providers.find(x => x.id === v);
    setModel(p?.defaultModel ?? '');
    setCreds({});
    setTestStatus(null);
  };

  const credsComplete = (provider?.requiredCreds || []).every(f => f.optional || (creds[f.key] || '').trim().length > 0);
  const credsTouched = Object.values(creds).some(v => v.trim().length > 0);
  const canTest = !!provider && credsComplete && !testing;
  // Test-before-save is mandatory only when the user is supplying new
  // credentials. When editing the currently-active provider (default OR a
  // saved custom provider) without entering creds — i.e. just tweaking
  // model / temperature / maxTokens / promptVersion — the server reuses the
  // already-validated stored credentials, so no re-test is required.
  const isCurrentProvider =
    data?.active?.providerId === providerId || data?.default?.providerId === providerId;
  const requiresTest = credsTouched || !isCurrentProvider;
  const canSave =
    !!provider &&
    !saving &&
    (requiresTest ? credsComplete && testStatus?.ok === true : true);

  const buildPayload = () => ({
    providerId,
    model: (model || provider?.defaultModel || '').trim(),
    temperature,
    maxTokens,
    promptVersion: promptVersion || data?.active?.promptVersion || 'v2.4',
    creds,
  });

  const handleTest = async () => {
    setTesting(true);
    setTestStatus(null);
    try {
      const r = await fetch('/api/ai/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const json = await r.json() as { ok: boolean; error?: string };
      if (json.ok) {
        setTestStatus({ ok: true, msg: 'Connection successful.' });
        toast({ title: 'Connection successful', description: `${provider?.label} responded to a test request.` });
      } else {
        setTestStatus({ ok: false, msg: json.error || 'Validation failed' });
        toast({ title: 'Connection failed', description: json.error || 'Validation failed', variant: 'destructive' });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setTestStatus({ ok: false, msg });
      toast({ title: 'Connection failed', description: msg, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const json = await r.json() as { ok?: boolean; error?: string };
      if (!r.ok || !json.ok) throw new Error(json.error || `HTTP ${r.status}`);
      toast({ title: 'AI provider saved', description: `${provider?.label} is now active for the AI Assistant.` });
      setCreds({});
      setTestStatus(null);
      await loadConfig();
    } catch (e) {
      toast({ title: 'Save failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      const r = await fetch('/api/ai/config/reset', { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      toast({ title: 'Reset to defaults', description: 'Custom credentials cleared. Using environment-default provider.' });
      setTestStatus(null);
      await loadConfig();
    } catch (e) {
      toast({ title: 'Reset failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  if (!data) {
    return (
      <div className="stat-card">
        <h3 className="font-medium mb-2">AI Assistant Configuration</h3>
        <p className="text-sm text-muted-foreground">Loading current configuration…</p>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <h3 className="font-medium">AI Assistant Configuration</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Controls the live model used by the AI Assistant, "Explain with AI", "Summarize KYC", "AI-Draft Narrative", and "Explain Risk".
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {data.active ? (
            <Badge variant={data.active.isCustom ? 'default' : 'secondary'} data-testid="badge-active-provider">
              Active: {data.active.providerLabel} ({data.active.model}){data.active.isCustom ? '' : ' • default'}
            </Badge>
          ) : (
            <Badge variant="destructive">No provider configured</Badge>
          )}
        </div>
      </div>

      {data.default && (
        <p className="text-xs text-muted-foreground mb-4">
          Default fallback: <span className="font-medium">{data.default.providerLabel}</span> ({data.default.model}) — used automatically if a custom provider fails.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Provider</Label>
          <Select value={providerId} onValueChange={handleProviderChange}>
            <SelectTrigger data-testid="select-aiProvider"><SelectValue /></SelectTrigger>
            <SelectContent>
              {data.providers.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>
            Model
            {provider && <FieldHelp text={provider.modelHelp} />}
          </Label>
          <Input
            value={model}
            onChange={(e) => { setModel(e.target.value); setTestStatus(null); }}
            placeholder={provider?.defaultModel}
            data-testid="input-aiModel"
          />
        </div>
        <div className="space-y-2">
          <Label>Temperature <FieldHelp text="Lower = more focused, higher = more creative (0–2)." /></Label>
          <div className="flex items-center gap-3">
            <Slider value={[temperature * 100]} onValueChange={([v]) => setTemperature(v / 100)} min={0} max={200} step={5} className="flex-1" data-testid="slider-temperature" />
            <span className="text-sm font-medium w-10 text-right">{temperature.toFixed(2)}</span>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Max Tokens</Label>
          <Input type="number" min={16} max={32000} value={maxTokens} onChange={(e) => setMaxTokens(+e.target.value || 0)} data-testid="input-maxTokens" />
        </div>
        <div className="space-y-2">
          <Label>Prompt Version <FieldHelp text="Metadata only — labels the active prompt set used by analyze/chat." /></Label>
          <Input value={promptVersion} onChange={(e) => onPromptVersionChange(e.target.value)} data-testid="input-promptVersion" />
        </div>
        <div className="flex items-center justify-between pt-6">
          <Label>RAG Enabled <FieldHelp text="Retrieval-Augmented Generation for context-aware responses (cosmetic — not yet wired)." /></Label>
          <Switch checked={ragEnabled} onCheckedChange={onRagEnabledChange} data-testid="switch-rag" />
        </div>
      </div>

      <Separator className="my-4" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">Credentials for {provider?.label}</h4>
          {isActiveProvider && data.active && (
            <span className="text-xs text-muted-foreground">
              Saved (masked):{' '}
              {Object.entries(data.active.credsMasked).map(([k, v]) => `${k}=${v}`).join('  ·  ')}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Credentials are sent to the SnapFort server in-memory only. They are never written to disk and are never echoed back unmasked.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(provider?.requiredCreds || []).map(f => (
            <div key={f.key} className="space-y-2">
              <Label>
                {f.label}
                {f.optional && <span className="ml-1 text-xs text-muted-foreground">(optional)</span>}
                {f.help && <FieldHelp text={f.help} />}
              </Label>
              {f.secret ? (
                <MaskedInput
                  value={creds[f.key] || ''}
                  onChange={(v) => { setCreds(prev => ({ ...prev, [f.key]: v })); setTestStatus(null); }}
                  placeholder={f.placeholder}
                />
              ) : (
                <Input
                  value={creds[f.key] || ''}
                  onChange={(e) => { setCreds(prev => ({ ...prev, [f.key]: e.target.value })); setTestStatus(null); }}
                  placeholder={f.placeholder}
                  data-testid={`input-cred-${f.key}`}
                />
              )}
            </div>
          ))}
        </div>
        {testStatus && (
          <div
            className={cn(
              'flex items-center gap-2 text-sm rounded-md px-3 py-2 border',
              testStatus.ok
                ? 'border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300'
                : 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
            )}
            data-testid="text-test-status"
          >
            {testStatus.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
            <span className="break-words">{testStatus.msg}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button
          variant="secondary"
          onClick={handleTest}
          disabled={!canTest}
          data-testid="button-test-connection"
        >
          {testing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
          Test Connection
        </Button>
        <Button
          onClick={handleSave}
          disabled={!canSave}
          data-testid="button-save-ai-config"
        >
          <Save className="h-4 w-4 mr-2" />
          Save & Activate
        </Button>
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={resetting || (data.active ? !data.active.isCustom : true)}
          data-testid="button-reset-ai-config"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
        {!canSave && requiresTest && credsComplete && testStatus?.ok !== true && (
          <span className="text-xs text-muted-foreground">Run "Test Connection" successfully before saving.</span>
        )}
        {!requiresTest && !credsTouched && (
          <span className="text-xs text-muted-foreground">Saved credentials will be reused — no re-test required.</span>
        )}
      </div>
    </div>
  );
}

function FieldHelp({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help inline ml-1" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusDot({ status }: { status: 'healthy' | 'degraded' | 'down' | string }) {
  const color = status === 'healthy' || status === 'connected' ? 'bg-emerald-500' :
    status === 'degraded' ? 'bg-yellow-500' : 'bg-red-500';
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
}

function SectionHeader({ icon: Icon, title, description, isDirty, onSave, onReset, saving, sectionId }: {
  icon: LucideIcon;
  title: string;
  description: string;
  isDirty: boolean;
  onSave: () => void;
  onReset: () => void;
  saving: boolean;
  sectionId?: string;
}) {
  const prefix = sectionId || title.toLowerCase().replace(/\s+/g, '-');
  const { can } = usePermissions();
  const canManage = can('manage_settings');
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isDirty && (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20">
            <AlertTriangle className="h-3 w-3 mr-1" /> Unsaved changes
          </Badge>
        )}
        {canManage && (
          <Button variant="outline" size="sm" onClick={onReset} data-testid={`button-reset-${prefix}`}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        )}
        {canManage ? (
          <Button size="sm" onClick={onSave} disabled={!isDirty || saving} data-testid={`button-save-${prefix}`}>
            <Save className="h-3.5 w-3.5 mr-1" /> {saving ? 'Saving...' : 'Save'}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Read-only — requires manage_settings</span>
        )}
      </div>
    </div>
  );
}

function RiskSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'risk'>) {
  const [simScore, setSimScore] = useState(72);
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);

  const getSimClassification = (score: number) => {
    if (score >= s.criticalThreshold * 0.76) return { label: 'Critical', color: 'text-red-600', actions: ['Auto-block', 'Create case', 'Alert compliance'] };
    if (score >= s.highThreshold * 0.51) return { label: 'High', color: 'text-orange-600', actions: ['Create alert', 'Flag for review'] };
    if (score >= s.mediumThreshold * 0.26) return { label: 'Medium', color: 'text-yellow-600', actions: ['Monitor', 'Queue for review'] };
    return { label: 'Low', color: 'text-green-600', actions: ['Log only'] };
  };
  const sim = getSimClassification(simScore);

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[0].icon} title="Risk Configuration" description="Risk thresholds, scoring formula, and simulation" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-1">Risk Score Formula</h3>
        <p className="text-xs text-muted-foreground mb-3">How the final risk score is calculated</p>
        <code className="block p-3 bg-muted/50 rounded-md text-sm font-mono">{s.formulaPreview}</code>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Score Classification Thresholds</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Low', field: 'lowThreshold', color: 'text-green-600', desc: 'Scores 0 – threshold' },
            { label: 'Medium', field: 'mediumThreshold', color: 'text-yellow-600', desc: 'Low+1 – threshold' },
            { label: 'High', field: 'highThreshold', color: 'text-orange-600', desc: 'Medium+1 – threshold' },
            { label: 'Critical', field: 'criticalThreshold', color: 'text-red-600', desc: 'High+1 – 100' },
          ].map((t) => (
            <div key={t.field} className="space-y-2">
              <Label className={t.color}>{t.label} Threshold</Label>
              <Input type="number" value={(s as any)[t.field]} onChange={(e) => u(t.field, +e.target.value)} data-testid={`input-${t.field}`} />
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Action Thresholds</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Alert Threshold <FieldHelp text="Score at which an alert is automatically generated" /></Label>
            <Input type="number" value={s.alertThreshold} onChange={(e) => u('alertThreshold', +e.target.value)} data-testid="input-alertThreshold" />
          </div>
          <div className="space-y-2">
            <Label>Auto-Case Threshold <FieldHelp text="Score at which a case is automatically created" /></Label>
            <Input type="number" value={s.autoCaseThreshold} onChange={(e) => u('autoCaseThreshold', +e.target.value)} data-testid="input-autoCaseThreshold" />
          </div>
          <div className="space-y-2">
            <Label>Auto-Block Threshold <FieldHelp text="Score at which a transaction is automatically blocked" /></Label>
            <Input type="number" value={s.autoBlockThreshold} onChange={(e) => u('autoBlockThreshold', +e.target.value)} data-testid="input-autoBlockThreshold" />
          </div>
        </div>
        <div className="flex items-center justify-between mt-4 p-3 bg-muted/30 rounded-lg">
          <div>
            <p className="font-medium text-sm">Dynamic Thresholds (Percentile-based)</p>
            <p className="text-xs text-muted-foreground">Automatically adjust thresholds based on score distribution</p>
          </div>
          <Switch checked={s.dynamicThresholds} onCheckedChange={(v) => u('dynamicThresholds', v)} data-testid="switch-dynamicThresholds" />
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Country-Specific Modifiers</h3>
        <div className="space-y-2">
          {s.countryThresholds.map((ct, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm w-32">{ct.country}</span>
              <Input type="number" step="0.1" value={ct.modifier} className="w-24"
                onChange={(e) => {
                  const updated = [...s.countryThresholds];
                  updated[i] = { ...updated[i], modifier: +e.target.value };
                  u('countryThresholds', updated);
                }}
                data-testid={`input-country-mod-${i}`}
              />
              <span className="text-xs text-muted-foreground">×</span>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Channel-Specific Modifiers</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {s.channelThresholds.map((ct, i) => (
            <div key={i} className="space-y-1">
              <Label className="text-xs">{ct.channel}</Label>
              <Input type="number" step="0.1" value={ct.modifier}
                onChange={(e) => {
                  const updated = [...s.channelThresholds];
                  updated[i] = { ...updated[i], modifier: +e.target.value };
                  u('channelThresholds', updated);
                }}
                data-testid={`input-channel-mod-${i}`}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card border-primary/20">
        <h3 className="font-medium mb-2">Risk Simulation Tool</h3>
        <p className="text-xs text-muted-foreground mb-4">Enter a score to see how it would be classified and what actions would trigger</p>
        <div className="flex items-center gap-4 mb-4">
          <Label className="whitespace-nowrap">Score:</Label>
          <Slider value={[simScore]} onValueChange={([v]) => setSimScore(v)} min={0} max={100} step={1} className="flex-1" data-testid="slider-sim-score" />
          <Input type="number" value={simScore} onChange={(e) => setSimScore(+e.target.value)} className="w-20" data-testid="input-sim-score" />
        </div>
        <div className="p-4 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm">Classification:</span>
            <Badge className={`${sim.color}`} variant="outline">{sim.label}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-sm text-muted-foreground">Triggered actions:</span>
            {sim.actions.map((a) => (
              <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'notifications'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[1].icon} title="Notifications & Alerts" description="Alert routing, channels, and preferences" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Alert Types</h3>
        <div className="space-y-4">
          {[
            { field: 'criticalAlerts', label: 'Critical Alerts', desc: 'Notify immediately for critical risk transactions' },
            { field: 'highRiskAlerts', label: 'High Risk Alerts', desc: 'Notify for high risk transactions' },
            { field: 'caseEscalations', label: 'Case Escalations', desc: 'Notify when cases are escalated' },
            { field: 'soundAlerts', label: 'Sound Alerts', desc: 'Play sound for critical notifications' },
          ].map((item, i) => (
            <div key={item.field}>
              {i > 0 && <Separator className="mb-4" />}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch checked={(s as any)[item.field]} onCheckedChange={(v) => u(item.field, v)} data-testid={`switch-${item.field}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Notification Channels</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Email Notifications</p>
              <p className="text-xs text-muted-foreground">Send alerts via email</p>
            </div>
            <Switch checked={s.emailNotifications} onCheckedChange={(v) => u('emailNotifications', v)} data-testid="switch-emailNotifications" />
          </div>
          {s.emailNotifications && (
            <div className="space-y-2 pl-4 border-l-2 border-primary/20">
              <Label>Email Recipients</Label>
              <Input value={s.emailRecipients} onChange={(e) => u('emailRecipients', e.target.value)} data-testid="input-emailRecipients" />
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">SMS Notifications</p>
              <p className="text-xs text-muted-foreground">Send critical alerts via SMS</p>
            </div>
            <Switch checked={s.smsNotifications} onCheckedChange={(v) => u('smsNotifications', v)} data-testid="switch-smsNotifications" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Slack Integration</p>
              <p className="text-xs text-muted-foreground">Push alerts to Slack channel</p>
            </div>
            <Switch checked={s.slackIntegration} onCheckedChange={(v) => u('slackIntegration', v)} data-testid="switch-slackIntegration" />
          </div>
          {s.slackIntegration && (
            <div className="space-y-2 pl-4 border-l-2 border-primary/20">
              <Label>Slack Webhook URL</Label>
              <MaskedInput value={s.slackWebhookUrl} onChange={(v) => u('slackWebhookUrl', v)} placeholder="https://hooks.slack.com/services/..." />
            </div>
          )}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Digest & Quiet Hours</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Digest Frequency</Label>
            <Select value={s.digestFrequency} onValueChange={(v) => u('digestFrequency', v)}>
              <SelectTrigger data-testid="select-digestFrequency"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="realtime">Real-time</SelectItem>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium text-sm">Quiet Hours</p>
              <p className="text-xs text-muted-foreground">Suppress non-critical alerts during specified hours</p>
            </div>
            <Switch checked={s.quietHoursEnabled} onCheckedChange={(v) => u('quietHoursEnabled', v)} data-testid="switch-quietHours" />
          </div>
          {s.quietHoursEnabled && (
            <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="time" value={s.quietHoursStart} onChange={(e) => u('quietHoursStart', e.target.value)} data-testid="input-quietStart" />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="time" value={s.quietHoursEnd} onChange={(e) => u('quietHoursEnd', e.target.value)} data-testid="input-quietEnd" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ComplianceSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'compliance'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);
  const retentionOptions = [
    { value: '1y', label: '1 Year' },
    { value: '3y', label: '3 Years' },
    { value: '5y', label: '5 Years' },
    { value: '7y', label: '7 Years (Regulatory)' },
    { value: '10y', label: '10 Years' },
  ];

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[2].icon} title="Data Retention & Compliance" description="Retention policies, regulatory profiles, anonymization" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Retention Policies</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { field: 'transactionRetention', label: 'Transaction History' },
            { field: 'auditLogRetention', label: 'Audit Logs' },
            { field: 'caseRetention', label: 'Case Records' },
            { field: 'sarRetention', label: 'SAR Reports' },
          ].map((item) => (
            <div key={item.field} className="space-y-2">
              <Label>{item.label}</Label>
              <Select value={(s as any)[item.field]} onValueChange={(v) => u(item.field, v)}>
                <SelectTrigger data-testid={`select-${item.field}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {retentionOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Country-Based Retention Policies</h3>
        <div className="space-y-2">
          {s.countryPolicies.map((cp, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm w-32">{cp.country}</span>
              <Select value={cp.retention} onValueChange={(v) => {
                const updated = [...s.countryPolicies];
                updated[i] = { ...updated[i], retention: v };
                u('countryPolicies', updated);
              }}>
                <SelectTrigger className="w-48" data-testid={`select-country-retention-${i}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {retentionOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Regulatory Profile</h3>
        <Select value={s.regulatoryProfile} onValueChange={(v) => u('regulatoryProfile', v)}>
          <SelectTrigger data-testid="select-regulatoryProfile"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="fatf">FATF</SelectItem>
            <SelectItem value="gdpr">GDPR</SelectItem>
            <SelectItem value="cbn">CBN (Nigeria)</SelectItem>
            <SelectItem value="sec">SEC</SelectItem>
            <SelectItem value="fincen">FinCEN</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Data Privacy</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Anonymization Policy</Label>
            <Select value={s.anonymizationPolicy} onValueChange={(v) => u('anonymizationPolicy', v)}>
              <SelectTrigger data-testid="select-anonymization"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hash">Hash (SHA-256)</SelectItem>
                <SelectItem value="mask">Mask (partial)</SelectItem>
                <SelectItem value="tokenize">Tokenize</SelectItem>
                <SelectItem value="redact">Full Redaction</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Right to Be Forgotten</p>
              <p className="text-xs text-muted-foreground">Enable GDPR Article 17 data erasure requests</p>
            </div>
            <Switch checked={s.rightToBeForgotten} onCheckedChange={(v) => u('rightToBeForgotten', v)} data-testid="switch-rtbf" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Auto-Delete & Archival</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Auto-Delete Scheduler</p>
              <p className="text-xs text-muted-foreground">Automatically delete data past retention period</p>
            </div>
            <Switch checked={s.autoDeleteEnabled} onCheckedChange={(v) => u('autoDeleteEnabled', v)} data-testid="switch-autoDelete" />
          </div>
          {s.autoDeleteEnabled && (
            <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
              <div className="space-y-2">
                <Label>Schedule</Label>
                <Select value={s.autoDeleteSchedule} onValueChange={(v) => u('autoDeleteSchedule', v)}>
                  <SelectTrigger data-testid="select-autoDeleteSchedule"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Archive Destination</Label>
                <Select value={s.archiveDestination} onValueChange={(v) => u('archiveDestination', v)}>
                  <SelectTrigger data-testid="select-archiveDest"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cold-storage">Cold Storage</SelectItem>
                    <SelectItem value="glacier">AWS Glacier</SelectItem>
                    <SelectItem value="azure-archive">Azure Archive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function IntegrationsSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'integrations'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<null | { status: string; latency: number; auth: string }>(null);

  const runHealthCheck = () => {
    setTesting(true);
    setTestResult(null);
    setTimeout(() => {
      setTestResult({ status: 'healthy', latency: 142, auth: 'Valid (expires in 23h)' });
      setTesting(false);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[3].icon} title="Integrations" description="Core banking APIs, webhooks, and connectors" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Core Banking Connection</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Connection Type</Label>
            <Select value={s.coreBankingType} onValueChange={(v) => u('coreBankingType', v)}>
              <SelectTrigger data-testid="select-coreBankingType"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="rest">REST API</SelectItem>
                <SelectItem value="soap">SOAP</SelectItem>
                <SelectItem value="iso8583">ISO 8583</SelectItem>
                <SelectItem value="kafka">Kafka Stream</SelectItem>
                <SelectItem value="sftp">File-based (SFTP Batch)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Authentication Type</Label>
            <Select value={s.authType} onValueChange={(v) => u('authType', v)}>
              <SelectTrigger data-testid="select-authType"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                <SelectItem value="mtls">mTLS</SelectItem>
                <SelectItem value="api-key">API Key</SelectItem>
                <SelectItem value="jwt">JWT</SelectItem>
                <SelectItem value="basic">Basic Auth (discouraged)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Base URL</Label>
            <Input value={s.baseUrl} onChange={(e) => u('baseUrl', e.target.value)} data-testid="input-baseUrl" />
          </div>
          <div className="space-y-2">
            <Label>API Version</Label>
            <Input value={s.apiVersion} onChange={(e) => u('apiVersion', e.target.value)} data-testid="input-apiVersion" />
          </div>
          <div className="space-y-2">
            <Label>Client ID</Label>
            <Input value={s.clientId} onChange={(e) => u('clientId', e.target.value)} data-testid="input-clientId" />
          </div>
          <div className="space-y-2">
            <Label>Client Secret <FieldHelp text="Stored encrypted in vault. Never exposed in frontend state." /></Label>
            <MaskedInput value={s.clientSecret} onChange={(v) => u('clientSecret', v)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="space-y-2">
            <Label>Timeout (ms)</Label>
            <Input type="number" value={s.timeout} onChange={(e) => u('timeout', +e.target.value)} data-testid="input-timeout" />
          </div>
          <div className="space-y-2">
            <Label>Retry Attempts</Label>
            <Input type="number" value={s.retryAttempts} onChange={(e) => u('retryAttempts', +e.target.value)} data-testid="input-retryAttempts" />
          </div>
          <div className="space-y-2">
            <Label>Circuit Breaker Threshold</Label>
            <Input type="number" value={s.circuitBreakerThreshold} onChange={(e) => u('circuitBreakerThreshold', +e.target.value)} data-testid="input-circuitBreaker" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Health Check</h3>
          <Button size="sm" variant="outline" onClick={runHealthCheck} disabled={testing} data-testid="button-test-connection">
            {testing ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
            Test Connection
          </Button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <StatusDot status={testResult?.status || s.healthStatus} />
              <span className="text-sm font-medium capitalize">{testResult?.status || s.healthStatus}</span>
            </div>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-xs text-muted-foreground">Latency</p>
            <p className="text-sm font-medium mt-1">{testResult?.latency || s.latency} ms</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-xs text-muted-foreground">Auth Status</p>
            <p className="text-sm font-medium mt-1">{testResult?.auth || 'Valid'}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-xs text-muted-foreground">Last Sync</p>
            <p className="text-sm font-medium mt-1">{formatTimestamp(s.lastHealthCheck)}</p>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Webhook Configuration</h3>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Outbound Webhook URL</Label>
            <Input value={s.webhookUrl} onChange={(e) => u('webhookUrl', e.target.value)} data-testid="input-webhookUrl" />
          </div>
          <div className="space-y-2">
            <Label>Webhook Secret <FieldHelp text="Used to verify webhook signatures" /></Label>
            <MaskedInput value={s.webhookSecret} onChange={(v) => u('webhookSecret', v)} />
          </div>
          <div className="space-y-2">
            <Label>Event Types</Label>
            <div className="flex flex-wrap gap-2">
              {['alert.created', 'case.updated', 'sar.filed', 'rule.updated', 'model.deployed', 'user.locked'].map((evt) => (
                <Badge key={evt} variant={s.webhookEvents.includes(evt) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => {
                    const events = s.webhookEvents.includes(evt)
                      ? s.webhookEvents.filter((e: string) => e !== evt)
                      : [...s.webhookEvents, evt];
                    u('webhookEvents', events);
                  }}
                  data-testid={`badge-event-${evt}`}
                >
                  {evt}
                </Badge>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Retry Policy</Label>
              <Select value={s.webhookRetryPolicy} onValueChange={(v) => u('webhookRetryPolicy', v)}>
                <SelectTrigger data-testid="select-retryPolicy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3x-exponential">3× Exponential Backoff</SelectItem>
                  <SelectItem value="5x-linear">5× Linear</SelectItem>
                  <SelectItem value="none">No Retry</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between mt-6">
              <Label>Signature Verification</Label>
              <Switch checked={s.signatureVerification} onCheckedChange={(v) => u('signatureVerification', v)} data-testid="switch-signatureVerification" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ObsHealthPayload {
  ok: boolean;
  configured?: boolean;
  bucket?: string;
  endpoint?: string;
  latencyMs?: number;
  status?: number;
  region?: string;
  storageClass?: string;
  sampleObjectCount?: number;
  backend?: 'huawei' | 'memory';
  steps?: { put?: number; sign?: number; fetch?: number; delete?: number };
  error?: string;
}

function HuaweiObsCard() {
  const { toast } = useToast();
  const [data, setData] = useState<ObsHealthPayload | null>(null);
  const [testing, setTesting] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  const loadHealth = useCallback(async (announce = false) => {
    setTesting(true);
    try {
      const r = await fetch('/api/system/obs-health');
      const json = (await r.json()) as ObsHealthPayload;
      setData(json);
      setLoadedAt(new Date().toISOString());
      if (announce) {
        toast({
          title: json.ok ? 'OBS reachable' : 'OBS unreachable',
          description: json.ok
            ? `Bucket ${json.bucket} responded in ${json.latencyMs}ms.`
            : (json.error || 'Connection failed'),
          variant: json.ok ? 'default' : 'destructive',
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setData({ ok: false, error: msg });
      if (announce) toast({ title: 'OBS test failed', description: msg, variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  }, [toast]);

  useEffect(() => { loadHealth(false); }, [loadHealth]);

  const status = data?.ok ? 'healthy' : data?.configured === false ? 'down' : 'down';
  const statusLabel = data?.ok ? 'Connected' : data?.configured === false ? 'Not configured' : 'Down';

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-medium">Huawei OBS — Object Storage</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live connection to the bucket SnapFort uses for KYC documents, case evidence, AI chats, and generated reports.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => loadHealth(true)} disabled={testing} data-testid="button-test-obs">
          {testing ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
          Test Connection
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Bucket</Label>
          <p className="text-sm font-medium" data-testid="text-obs-bucket">{data?.bucket || '—'}</p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Endpoint</Label>
          <p className="text-sm font-mono break-all" data-testid="text-obs-endpoint">{data?.endpoint || '—'}</p>
        </div>
        {data?.region && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Region</Label>
            <p className="text-sm font-medium">{data.region}</p>
          </div>
        )}
        {data?.storageClass && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Storage Class</Label>
            <p className="text-sm font-medium">{data.storageClass}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
        <div className="p-3 bg-muted/30 rounded-lg text-center">
          <p className="text-xs text-muted-foreground">Status</p>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <StatusDot status={status} />
            <span className="text-sm font-medium" data-testid="text-obs-status">{statusLabel}</span>
          </div>
        </div>
        <div className="p-3 bg-muted/30 rounded-lg text-center">
          <p className="text-xs text-muted-foreground">Round-trip</p>
          <p className="text-sm font-medium mt-1">{data?.latencyMs != null ? `${data.latencyMs} ms` : '—'}</p>
        </div>
        <div className="p-3 bg-muted/30 rounded-lg text-center">
          <p className="text-xs text-muted-foreground">Backend</p>
          <p className="text-sm font-medium mt-1 capitalize">{data?.backend ?? '—'}</p>
        </div>
        <div className="p-3 bg-muted/30 rounded-lg text-center">
          <p className="text-xs text-muted-foreground">Last Check</p>
          <p className="text-sm font-medium mt-1">{loadedAt ? formatTimestamp(loadedAt) : '—'}</p>
        </div>
      </div>

      {data?.steps && (
        <div className="grid grid-cols-4 gap-4 mt-3">
          {(['put', 'sign', 'fetch', 'delete'] as const).map((s) => (
            <div key={s} className="p-2 rounded-md border text-center">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{s}</p>
              <p className="text-xs font-mono mt-0.5" data-testid={`text-obs-step-${s}`}>
                {data.steps?.[s] != null ? `${data.steps[s]} ms` : '—'}
              </p>
            </div>
          ))}
        </div>
      )}

      {data?.backend === 'memory' && (
        <div className="mt-4 flex items-start gap-2 text-sm rounded-md px-3 py-2 border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Using in-memory fallback. Uploads will be lost on restart — set HUAWEI_OBS_* secrets to use real OBS.</span>
        </div>
      )}

      {!data?.ok && data?.error && (
        <div className="mt-4 flex items-start gap-2 text-sm rounded-md px-3 py-2 border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="break-words" data-testid="text-obs-error">{data.error}</span>
        </div>
      )}
    </div>
  );
}

function DatabaseSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'database'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);
  const [testing, setTesting] = useState(false);

  const runDbTest = () => {
    setTesting(true);
    setTimeout(() => setTesting(false), 1200);
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[4].icon} title="Database & Storage" description="Database connections, replicas, and encryption" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Primary Transaction Database</h3>
          <Button size="sm" variant="outline" onClick={runDbTest} disabled={testing} data-testid="button-test-db">
            {testing ? <RefreshCw className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
            Test Connection
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Database Type</Label>
            <Select value={s.primaryDbType} onValueChange={(v) => u('primaryDbType', v)}>
              <SelectTrigger data-testid="select-dbType"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="postgres">PostgreSQL</SelectItem>
                <SelectItem value="mysql">MySQL</SelectItem>
                <SelectItem value="sqlserver">SQL Server</SelectItem>
                <SelectItem value="oracle">Oracle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Host</Label>
            <Input value={s.primaryHost} onChange={(e) => u('primaryHost', e.target.value)} data-testid="input-dbHost" />
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            <Input type="number" value={s.primaryPort} onChange={(e) => u('primaryPort', +e.target.value)} data-testid="input-dbPort" />
          </div>
          <div className="space-y-2">
            <Label>Database Name</Label>
            <Input value={s.primaryDbName} onChange={(e) => u('primaryDbName', e.target.value)} data-testid="input-dbName" />
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input value={s.primaryUsername} onChange={(e) => u('primaryUsername', e.target.value)} data-testid="input-dbUser" />
          </div>
          <div className="space-y-2">
            <Label>Password <FieldHelp text="Stored encrypted in vault" /></Label>
            <MaskedInput value={s.primaryPassword} onChange={(v) => u('primaryPassword', v)} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="flex items-center justify-between">
            <Label className="text-sm">SSL Required</Label>
            <Switch checked={s.primarySsl} onCheckedChange={(v) => u('primarySsl', v)} data-testid="switch-dbSsl" />
          </div>
          <div className="space-y-2">
            <Label>Pool Size</Label>
            <Input type="number" value={s.primaryPoolSize} onChange={(e) => u('primaryPoolSize', +e.target.value)} data-testid="input-poolSize" />
          </div>
          <div className="space-y-2">
            <Label>Max Connections</Label>
            <Input type="number" value={s.primaryMaxConnections} onChange={(e) => u('primaryMaxConnections', +e.target.value)} data-testid="input-maxConn" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-xs text-muted-foreground">Status</p>
            <div className="flex items-center justify-center gap-1.5 mt-1">
              <StatusDot status={s.connectionStatus} />
              <span className="text-sm font-medium capitalize">{s.connectionStatus}</span>
            </div>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-xs text-muted-foreground">Ping</p>
            <p className="text-sm font-medium mt-1">{s.pingTime} ms</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-xs text-muted-foreground">Pool</p>
            <p className="text-sm font-medium mt-1">{s.poolStatus}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg text-center">
            <p className="text-xs text-muted-foreground">Last Query</p>
            <p className="text-sm font-medium mt-1">{formatTimestamp(s.lastSuccessfulQuery)}</p>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Replicas & Analytics</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Read Replica</p>
              <p className="text-xs text-muted-foreground">Route read queries to replica for performance</p>
            </div>
            <Switch checked={s.readReplicaEnabled} onCheckedChange={(v) => u('readReplicaEnabled', v)} data-testid="switch-readReplica" />
          </div>
          {s.readReplicaEnabled && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-2">
              <Label>Replica Host</Label>
              <Input value={s.readReplicaHost} onChange={(e) => u('readReplicaHost', e.target.value)} data-testid="input-replicaHost" />
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Analytics Database</p>
              <p className="text-xs text-muted-foreground">Separate database for analytical queries</p>
            </div>
            <Switch checked={s.analyticsDbEnabled} onCheckedChange={(v) => u('analyticsDbEnabled', v)} data-testid="switch-analyticsDb" />
          </div>
          {s.analyticsDbEnabled && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-2">
              <Label>Analytics DB Host</Label>
              <Input value={s.analyticsDbHost} onChange={(e) => u('analyticsDbHost', e.target.value)} data-testid="input-analyticsHost" />
            </div>
          )}
        </div>
      </div>

      <HuaweiObsCard />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Object Storage & Data Lake</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Data Lake Type</Label>
            <Select value={s.dataLakeType} onValueChange={(v) => u('dataLakeType', v)}>
              <SelectTrigger data-testid="select-dataLakeType"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="s3">Amazon S3</SelectItem>
                <SelectItem value="azure-blob">Azure Blob Storage</SelectItem>
                <SelectItem value="gcs">Google Cloud Storage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Data Lake Bucket</Label>
            <Input value={s.dataLakeBucket} onChange={(e) => u('dataLakeBucket', e.target.value)} data-testid="input-dataLakeBucket" />
          </div>
          <div className="space-y-2">
            <Label>Evidence Storage Type</Label>
            <Select value={s.objectStorageType} onValueChange={(v) => u('objectStorageType', v)}>
              <SelectTrigger data-testid="select-objectStorageType"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="s3">Amazon S3</SelectItem>
                <SelectItem value="azure-blob">Azure Blob Storage</SelectItem>
                <SelectItem value="gcs">Google Cloud Storage</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Evidence Bucket</Label>
            <Input value={s.objectStorageBucket} onChange={(e) => u('objectStorageBucket', e.target.value)} data-testid="input-evidenceBucket" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Encryption & Masking</h3>
        <div className="space-y-4">
          {[
            { field: 'encryptionAtRest', label: 'Encryption at Rest', desc: 'All data encrypted on disk using AES-256' },
            { field: 'rowLevelEncryption', label: 'Row-Level Encryption', desc: 'PII fields encrypted at row level' },
            { field: 'dataMasking', label: 'Data Masking', desc: 'Mask sensitive fields in non-production queries' },
          ].map((item, i) => (
            <div key={item.field}>
              {i > 0 && <Separator />}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch checked={(s as any)[item.field]} onCheckedChange={(v) => u(item.field, v)} data-testid={`switch-${item.field}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModelSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'model'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[5].icon} title="Model & AI Configuration" description="ML models, AI assistant, feature store" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Active Fraud Detection Model</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Model Name</Label>
            <Input value={s.activeModelName} onChange={(e) => u('activeModelName', e.target.value)} data-testid="input-modelName" />
          </div>
          <div className="space-y-2">
            <Label>Version</Label>
            <Input value={s.activeModelVersion} onChange={(e) => u('activeModelVersion', e.target.value)} data-testid="input-modelVersion" />
          </div>
          <div className="space-y-2">
            <Label>Last Trained</Label>
            <Input type="date" value={s.lastTrainedDate} onChange={(e) => u('lastTrainedDate', e.target.value)} data-testid="input-lastTrained" />
          </div>
          <div className="space-y-2">
            <Label>Deployment Environment</Label>
            <Select value={s.deploymentEnv} onValueChange={(v) => u('deploymentEnv', v)}>
              <SelectTrigger data-testid="select-deploymentEnv"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="development">Development</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Label>Confidence Threshold <FieldHelp text="Minimum confidence score for model predictions" /></Label>
          <div className="flex items-center gap-4">
            <Slider value={[s.confidenceThreshold * 100]} onValueChange={([v]) => u('confidenceThreshold', v / 100)} min={0} max={100} step={1} className="flex-1" data-testid="slider-confidence" />
            <span className="text-sm font-medium w-12 text-right">{(s.confidenceThreshold * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Risk Weight Multipliers</h3>
        <div className="space-y-3">
          {s.riskWeightMultipliers.map((rw, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-sm w-40">{rw.factor}</span>
              <Slider value={[rw.weight * 100]} onValueChange={([v]) => {
                const updated = [...s.riskWeightMultipliers];
                updated[i] = { ...updated[i], weight: v / 100 };
                u('riskWeightMultipliers', updated);
              }} min={0} max={200} step={5} className="flex-1" data-testid={`slider-weight-${i}`} />
              <span className="text-sm font-medium w-12 text-right">{rw.weight.toFixed(1)}×</span>
            </div>
          ))}
        </div>
      </div>

      <AIAssistantLiveConfig
        promptVersion={s.aiPromptVersion}
        onPromptVersionChange={(v) => u('aiPromptVersion', v)}
        ragEnabled={s.ragEnabled}
        onRagEnabledChange={(v) => u('ragEnabled', v)}
      />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Model Monitoring</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Drift Threshold (%)</Label>
            <Input type="number" step="0.1" value={s.driftThreshold} onChange={(e) => u('driftThreshold', +e.target.value)} data-testid="input-driftThreshold" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>Auto-Retraining</Label>
              <p className="text-xs text-muted-foreground">Trigger retraining on drift</p>
            </div>
            <Switch checked={s.autoRetraining} onCheckedChange={(v) => u('autoRetraining', v)} data-testid="switch-autoRetrain" />
          </div>
          <div className="space-y-2">
            <Label>Degradation Alert (%)</Label>
            <Input type="number" value={s.performanceDegradationAlert} onChange={(e) => u('performanceDegradationAlert', +e.target.value)} data-testid="input-degradationAlert" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Advanced Model Settings</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Shadow Model Testing</p>
              <p className="text-xs text-muted-foreground">Run shadow models in parallel without affecting production scoring</p>
            </div>
            <Switch checked={s.shadowModelTesting} onCheckedChange={(v) => u('shadowModelTesting', v)} data-testid="switch-shadowModel" />
          </div>
          <Separator />
          <div className="space-y-2">
            <Label>Champion / Challenger Mode</Label>
            <Select value={s.championChallengerMode} onValueChange={(v) => u('championChallengerMode', v)}>
              <SelectTrigger data-testid="select-champChallenger"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="champion">Champion Only</SelectItem>
                <SelectItem value="challenger">Challenger Testing</SelectItem>
                <SelectItem value="ab-test">A/B Test (50/50)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Feature Store</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Source</Label>
            <Select value={s.featureStoreSource} onValueChange={(v) => u('featureStoreSource', v)}>
              <SelectTrigger data-testid="select-featureStoreSource"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="feast">Feast</SelectItem>
                <SelectItem value="tecton">Tecton</SelectItem>
                <SelectItem value="sagemaker">SageMaker</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Sync Frequency</Label>
            <Select value={s.featureStoreSyncFreq} onValueChange={(v) => u('featureStoreSyncFreq', v)}>
              <SelectTrigger data-testid="select-syncFreq"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="5min">5 minutes</SelectItem>
                <SelectItem value="15min">15 minutes</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Freshness Threshold</Label>
            <Select value={s.featureFreshnessThreshold} onValueChange={(v) => u('featureFreshnessThreshold', v)}>
              <SelectTrigger data-testid="select-freshness"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15min">15 minutes</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="6h">6 hours</SelectItem>
                <SelectItem value="24h">24 hours</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

function SecuritySection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'security'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[6].icon} title="Security & Access Controls" description="Authentication, MFA, API security, IP controls" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {([
          { label: 'MFA Adoption', value: `${s.mfaAdoption}%`, color: s.mfaAdoption >= 90 ? 'text-emerald-600' : 'text-yellow-600', icon: ShieldCheck },
          { label: 'Failed Logins (24h)', value: `${s.failedLogins24h}`, color: s.failedLogins24h > 50 ? 'text-red-600' : 'text-foreground', icon: XCircle },
          { label: 'Suspicious Logins', value: `${s.suspiciousLogins}`, color: s.suspiciousLogins > 5 ? 'text-red-600' : 'text-yellow-600', icon: ShieldAlert },
          { label: 'Locked Accounts', value: `${s.lockedAccounts}`, color: 'text-foreground', icon: Lock },
        ] as { label: string; value: string; color: string; icon: LucideIcon }[]).map((m) => {
          const IconComp = m.icon;
          return (
          <div key={m.label} className="stat-card text-center">
            <IconComp className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className={`text-xl font-bold ${m.color}`}>{m.value}</p>
          </div>
          );
        })}
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Authentication</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>SSO Provider</Label>
            <Select value={s.ssoProvider} onValueChange={(v) => u('ssoProvider', v)}>
              <SelectTrigger data-testid="select-ssoProvider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="azure-ad">Azure AD</SelectItem>
                <SelectItem value="okta">Okta</SelectItem>
                <SelectItem value="google">Google Workspace</SelectItem>
                <SelectItem value="none">None (local auth)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between mt-6">
            <Label>Enforce MFA</Label>
            <Switch checked={s.enforceMfa} onCheckedChange={(v) => u('enforceMfa', v)} data-testid="switch-enforceMfa" />
          </div>
          <div className="space-y-2">
            <Label>Password Min Length</Label>
            <Input type="number" value={s.passwordMinLength} onChange={(e) => u('passwordMinLength', +e.target.value)} data-testid="input-pwMinLength" />
          </div>
          <div className="space-y-2">
            <Label>Password Complexity</Label>
            <Select value={s.passwordComplexity} onValueChange={(v) => u('passwordComplexity', v)}>
              <SelectTrigger data-testid="select-pwComplexity"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="basic">Basic (letters + numbers)</SelectItem>
                <SelectItem value="moderate">Moderate (+ special chars)</SelectItem>
                <SelectItem value="strong">Strong (uppercase, lowercase, number, special)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Session Timeout (min)</Label>
            <Input type="number" value={s.sessionTimeout} onChange={(e) => u('sessionTimeout', +e.target.value)} data-testid="input-sessionTimeout" />
          </div>
          <div className="space-y-2">
            <Label>Concurrent Session Limit</Label>
            <Input type="number" value={s.concurrentSessionLimit} onChange={(e) => u('concurrentSessionLimit', +e.target.value)} data-testid="input-concurrentSessions" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Access Controls</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">IP Whitelisting</p>
              <p className="text-xs text-muted-foreground">Restrict access to approved IP ranges</p>
            </div>
            <Switch checked={s.ipWhitelistEnabled} onCheckedChange={(v) => u('ipWhitelistEnabled', v)} data-testid="switch-ipWhitelist" />
          </div>
          {s.ipWhitelistEnabled && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-2">
              <Label>Whitelisted IP Ranges</Label>
              {s.ipWhitelist.map((ip, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={ip} className="font-mono text-sm"
                    onChange={(e) => {
                      const updated = [...s.ipWhitelist];
                      updated[i] = e.target.value;
                      u('ipWhitelist', updated);
                    }}
                    data-testid={`input-ip-${i}`}
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => u('ipWhitelist', s.ipWhitelist.filter((_: any, j: number) => j !== i))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => u('ipWhitelist', [...s.ipWhitelist, ''])}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add IP Range
              </Button>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Geo-Blocking</p>
              <p className="text-xs text-muted-foreground">Block access from specific countries</p>
            </div>
            <Switch checked={s.geoBlocking} onCheckedChange={(v) => u('geoBlocking', v)} data-testid="switch-geoBlocking" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">API Security</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>API Rate Limit (req/min)</Label>
            <Input type="number" value={s.apiRateLimit} onChange={(e) => u('apiRateLimit', +e.target.value)} data-testid="input-apiRateLimit" />
          </div>
          <div className="flex items-center justify-between mt-6">
            <Label>API IP Restriction</Label>
            <Switch checked={s.apiIpRestriction} onCheckedChange={(v) => u('apiIpRestriction', v)} data-testid="switch-apiIpRestriction" />
          </div>
          <div className="space-y-2">
            <Label>Token Expiry (sec)</Label>
            <Input type="number" value={s.tokenExpiryDuration} onChange={(e) => u('tokenExpiryDuration', +e.target.value)} data-testid="input-tokenExpiry" />
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkflowSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'workflow'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[7].icon} title="Workflow & Escalations" description="SLA thresholds, escalation tiers, auto-assign" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-4">SLA Thresholds</h3>
        <div className="space-y-3">
          {s.slaThresholds.map((sla, i) => (
            <div key={i} className="flex items-center gap-4">
              <Badge variant={sla.severity === 'Critical' ? 'destructive' : sla.severity === 'High' ? 'default' : 'secondary'} className="w-20 justify-center">
                {sla.severity}
              </Badge>
              <div className="flex items-center gap-2 flex-1">
                <Input type="number" value={sla.hours} className="w-24"
                  onChange={(e) => {
                    const updated = [...s.slaThresholds];
                    updated[i] = { ...updated[i], hours: +e.target.value };
                    u('slaThresholds', updated);
                  }}
                  data-testid={`input-sla-${i}`}
                />
                <span className="text-sm text-muted-foreground">hours to resolve</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Escalation Tiers</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-medium text-muted-foreground">Tier</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Role</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Timeout (hrs)</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Notify</th>
              </tr>
            </thead>
            <tbody>
              {s.escalationTiers.map((tier, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="p-2"><Badge variant="outline">Tier {tier.tier}</Badge></td>
                  <td className="p-2">{tier.name}</td>
                  <td className="p-2">
                    <Input type="number" value={tier.timeoutHours} className="w-20"
                      onChange={(e) => {
                        const updated = [...s.escalationTiers];
                        updated[i] = { ...updated[i], timeoutHours: +e.target.value };
                        u('escalationTiers', updated);
                      }}
                      data-testid={`input-tier-timeout-${i}`}
                    />
                  </td>
                  <td className="p-2 text-muted-foreground">{tier.notifyRole}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Assignment & Routing</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Auto-Assign</p>
              <p className="text-xs text-muted-foreground">Automatically assign cases to analysts</p>
            </div>
            <Switch checked={s.autoAssignEnabled} onCheckedChange={(v) => u('autoAssignEnabled', v)} data-testid="switch-autoAssign" />
          </div>
          {s.autoAssignEnabled && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-4">
              <div className="space-y-2">
                <Label>Assignment Logic</Label>
                <Select value={s.autoAssignLogic} onValueChange={(v) => u('autoAssignLogic', v)}>
                  <SelectTrigger data-testid="select-assignLogic"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="round-robin">Round Robin</SelectItem>
                    <SelectItem value="least-loaded">Least Loaded</SelectItem>
                    <SelectItem value="skill-based">Skill-Based</SelectItem>
                    <SelectItem value="random">Random</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Reassignment Timeout (hours)</Label>
                <Input type="number" value={s.reassignmentTimeout} onChange={(e) => u('reassignmentTimeout', +e.target.value)} data-testid="input-reassignTimeout" />
              </div>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">AI-Assisted Escalation Recommendation</p>
              <p className="text-xs text-muted-foreground">Use AI to suggest escalation paths based on case complexity</p>
            </div>
            <Switch checked={s.aiEscalationRecommendation} onCheckedChange={(v) => u('aiEscalationRecommendation', v)} data-testid="switch-aiEscalation" />
          </div>
          <div className="space-y-2">
            <Label>Notification Routing</Label>
            <Select value={s.escalationNotificationRouting} onValueChange={(v) => u('escalationNotificationRouting', v)}>
              <SelectTrigger data-testid="select-notifRouting"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email Only</SelectItem>
                <SelectItem value="slack">Slack Only</SelectItem>
                <SelectItem value="email+slack">Email + Slack</SelectItem>
                <SelectItem value="sms+email">SMS + Email</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuditSection({ settings, onUpdate, isDirty, onSave, onReset, auditLog }: SectionProps<'audit'> & { auditLog: AuditEntry[] }) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[8].icon} title="Audit & Logging" description="Log retention, SIEM integration, change tracking" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Log Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Log Retention Period</Label>
            <Select value={s.logRetentionPeriod} onValueChange={(v) => u('logRetentionPeriod', v)}>
              <SelectTrigger data-testid="select-logRetention"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1y">1 Year</SelectItem>
                <SelectItem value="3y">3 Years</SelectItem>
                <SelectItem value="5y">5 Years</SelectItem>
                <SelectItem value="7y">7 Years</SelectItem>
                <SelectItem value="forever">Forever</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between mt-6">
            <Label>Immutable Logs <FieldHelp text="Logs cannot be modified or deleted once written" /></Label>
            <Switch checked={s.immutableLogs} onCheckedChange={(v) => u('immutableLogs', v)} data-testid="switch-immutableLogs" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Export & Streaming</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Log Export</p>
              <p className="text-xs text-muted-foreground">Enable periodic log export</p>
            </div>
            <Switch checked={s.logExportEnabled} onCheckedChange={(v) => u('logExportEnabled', v)} data-testid="switch-logExport" />
          </div>
          {s.logExportEnabled && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-2">
              <Label>Export Format</Label>
              <Select value={s.logExportFormat} onValueChange={(v) => u('logExportFormat', v)}>
                <SelectTrigger data-testid="select-logFormat"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="csv">CSV</SelectItem>
                  <SelectItem value="syslog">Syslog</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Log Streaming</p>
              <p className="text-xs text-muted-foreground">Stream logs to external endpoint in real-time</p>
            </div>
            <Switch checked={s.logStreamingEnabled} onCheckedChange={(v) => u('logStreamingEnabled', v)} data-testid="switch-logStreaming" />
          </div>
          {s.logStreamingEnabled && (
            <div className="pl-4 border-l-2 border-primary/20 space-y-2">
              <Label>Streaming Endpoint</Label>
              <Input value={s.logStreamingEndpoint} onChange={(e) => u('logStreamingEndpoint', e.target.value)} placeholder="https://log-stream.internal/ingest" data-testid="input-streamEndpoint" />
            </div>
          )}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">SIEM Integration</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>SIEM Type</Label>
            <Select value={s.siemIntegrationType} onValueChange={(v) => u('siemIntegrationType', v)}>
              <SelectTrigger data-testid="select-siemType"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="splunk">Splunk</SelectItem>
                <SelectItem value="sentinel">Microsoft Sentinel</SelectItem>
                <SelectItem value="elastic">Elastic SIEM</SelectItem>
                <SelectItem value="qradar">IBM QRadar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {s.siemIntegrationType !== 'none' && (
            <div className="space-y-2">
              <Label>SIEM Endpoint</Label>
              <Input value={s.siemEndpoint} onChange={(e) => u('siemEndpoint', e.target.value)} placeholder="https://siem.internal/api/v1/events" data-testid="input-siemEndpoint" />
            </div>
          )}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Recent Configuration Changes</h3>
        <div className="p-3 bg-muted/30 rounded-lg mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last change:</span>
            <span>{formatTimestamp(s.lastConfigChange)}</span>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <span className="text-muted-foreground">Changed by:</span>
            <span>{s.lastChangedBy}</span>
          </div>
        </div>
        {auditLog.length > 0 ? (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {auditLog.slice(0, 20).map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 p-2 text-xs border rounded-lg">
                <Badge variant="outline" className="text-[10px]">{entry.id}</Badge>
                <div className="flex-1">
                  <p className="font-medium">{entry.field}</p>
                  <p className="text-muted-foreground">
                    <span className="line-through text-red-500">{entry.oldValue}</span>
                    {' → '}
                    <span className="text-green-600">{entry.newValue}</span>
                  </p>
                </div>
                <div className="text-right text-muted-foreground">
                  <p>{entry.user.split(' ')[0]} {entry.user.split(' ')[1]}</p>
                  <p>{formatTimestamp(entry.timestamp)}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No changes logged in this session</p>
        )}
      </div>
    </div>
  );
}

function EnvironmentSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'environment'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[9].icon} title="Environment & Deployment" description="Environment config, debug mode, versioning" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Environment</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Current Environment</Label>
            <Select value={s.currentEnvironment} onValueChange={(v) => u('currentEnvironment', v)}>
              <SelectTrigger data-testid="select-environment"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="development">Development</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between mt-6">
            <div>
              <Label>Feature Isolation</Label>
              <p className="text-xs text-muted-foreground">Isolate features per environment</p>
            </div>
            <Switch checked={s.featureIsolation} onCheckedChange={(v) => u('featureIsolation', v)} data-testid="switch-featureIsolation" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Operational Modes</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Debug Mode</p>
              <p className="text-xs text-muted-foreground">Enable verbose logging and debug endpoints</p>
            </div>
            <Switch checked={s.debugMode} onCheckedChange={(v) => u('debugMode', v)} data-testid="switch-debugMode" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm text-yellow-600">Maintenance Mode</p>
              <p className="text-xs text-muted-foreground">Display maintenance page to all users</p>
            </div>
            <Switch checked={s.maintenanceMode} onCheckedChange={(v) => u('maintenanceMode', v)} data-testid="switch-maintenanceMode" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Version Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { label: 'System Version', value: s.systemVersion },
            { label: 'Build Number', value: s.buildNumber },
            { label: 'Container Version', value: s.containerVersion },
            { label: 'Docker Image', value: s.dockerImageTag },
            { label: 'K8s Namespace', value: s.kubernetesNamespace },
          ].map((v) => (
            <div key={v.label} className="p-3 bg-muted/30 rounded-lg">
              <p className="text-xs text-muted-foreground">{v.label}</p>
              <p className="text-sm font-mono font-medium mt-1">{v.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureFlagsSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'features'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);

  const toggleFlag = (id: string) => {
    const flags = s.flags.map((f: any) => f.id === id ? { ...f, enabled: !f.enabled } : f);
    u('flags', flags);
  };

  const updateRollout = (id: string, pct: number) => {
    const flags = s.flags.map((f: any) => f.id === id ? { ...f, rolloutPercentage: pct } : f);
    u('flags', flags);
  };

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[10].icon} title="Feature Flags" description="Feature toggles and gradual rollouts" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="space-y-3">
        {s.flags.map((flag: any) => (
          <div key={flag.id} className="stat-card">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-sm">{flag.name}</h4>
                  {flag.tenantSpecific && <Badge variant="outline" className="text-[10px]">Tenant-specific</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{flag.description}</p>
                {flag.enabled && (
                  <div className="flex items-center gap-3 mt-3">
                    <Label className="text-xs whitespace-nowrap">Rollout:</Label>
                    <Slider value={[flag.rolloutPercentage]} onValueChange={([v]) => updateRollout(flag.id, v)} min={0} max={100} step={5} className="w-48" data-testid={`slider-rollout-${flag.id}`} />
                    <span className="text-xs font-medium w-10">{flag.rolloutPercentage}%</span>
                  </div>
                )}
              </div>
              <Switch checked={flag.enabled} onCheckedChange={() => toggleFlag(flag.id)} data-testid={`switch-flag-${flag.id}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BackupSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'backup'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[11].icon} title="Backup & Recovery" description="Backup schedules, snapshots, disaster recovery" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Backup Schedule</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Backup Frequency</Label>
            <Select value={s.backupFrequency} onValueChange={(v) => u('backupFrequency', v)}>
              <SelectTrigger data-testid="select-backupFreq"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Hourly</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Snapshot Retention</Label>
            <Select value={s.snapshotRetention} onValueChange={(v) => u('snapshotRetention', v)}>
              <SelectTrigger data-testid="select-snapshotRetention"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 Days</SelectItem>
                <SelectItem value="30d">30 Days</SelectItem>
                <SelectItem value="90d">90 Days</SelectItem>
                <SelectItem value="1y">1 Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Last Backup</p>
            <p className="text-sm font-medium">{formatTimestamp(s.lastBackup)}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Next Backup</p>
            <p className="text-sm font-medium">{formatTimestamp(s.nextBackup)}</p>
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Disaster Recovery</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>DR Region</Label>
            <Select value={s.disasterRecoveryRegion} onValueChange={(v) => u('disasterRecoveryRegion', v)}>
              <SelectTrigger data-testid="select-drRegion"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="eu-west-1">EU West (Ireland)</SelectItem>
                <SelectItem value="us-east-1">US East (Virginia)</SelectItem>
                <SelectItem value="ap-southeast-1">Asia Pacific (Singapore)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between mt-6">
            <div>
              <Label>Failover Enabled</Label>
              <p className="text-xs text-muted-foreground">Auto-failover to DR region</p>
            </div>
            <Switch checked={s.failoverEnabled} onCheckedChange={(v) => u('failoverEnabled', v)} data-testid="switch-failover" />
          </div>
        </div>
        <div className="p-3 bg-muted/30 rounded-lg mt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Replication Lag</span>
            <span className="text-sm font-medium">{s.replicationLag} sec</span>
          </div>
          <Progress value={Math.min(s.replicationLag * 20, 100)} className="mt-2 h-1.5" />
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Restore Points</h3>
        <div className="space-y-2">
          {s.restorePoints.map((rp: any) => (
            <div key={rp.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <Badge variant="outline">{rp.type}</Badge>
                <span className="text-sm">{formatTimestamp(rp.timestamp)}</span>
                <span className="text-xs text-muted-foreground">{rp.size}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (confirm(`Restore from ${rp.type} backup taken on ${formatTimestamp(rp.timestamp)}? This will roll the system back to that point.`)) {
                    toast({ title: 'Restore initiated', description: `Rolling back to ${formatTimestamp(rp.timestamp)} (${rp.size})…` });
                  }
                }}
                data-testid={`button-restore-${rp.id}`}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SystemHealthSection({ settings }: { settings: AllSettings['health'] }) {
  const s = settings;
  const { toast } = useToast();

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Activity className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">System Health</h2>
          <p className="text-sm text-muted-foreground">Uptime, latency, resource utilization</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'API Uptime', value: `${s.apiUptime}%`, progress: s.apiUptime, color: s.apiUptime >= 99.9 ? 'text-emerald-600' : 'text-yellow-600' },
          { label: 'DB Uptime', value: `${s.dbUptime}%`, progress: s.dbUptime, color: 'text-emerald-600' },
          { label: 'Scoring Latency', value: `${s.avgScoringLatency}ms`, progress: 100 - s.avgScoringLatency, color: s.avgScoringLatency < 50 ? 'text-emerald-600' : 'text-yellow-600' },
          { label: 'Model Inference', value: `${s.modelInferenceTime}ms`, progress: 100 - s.modelInferenceTime, color: 'text-foreground' },
        ].map((m) => (
          <div key={m.label} className="stat-card text-center">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
            <Progress value={m.progress} className="mt-2 h-1" />
          </div>
        ))}
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Resource Utilization</h3>
        <div className="space-y-4">
          {[
            { label: 'CPU Usage', value: s.cpuUsage, color: s.cpuUsage > 80 ? 'bg-red-500' : s.cpuUsage > 60 ? 'bg-yellow-500' : 'bg-emerald-500' },
            { label: 'Memory Usage', value: s.memoryUsage, color: s.memoryUsage > 80 ? 'bg-red-500' : s.memoryUsage > 60 ? 'bg-yellow-500' : 'bg-emerald-500' },
            { label: 'Disk Usage', value: s.diskUsage, color: s.diskUsage > 80 ? 'bg-red-500' : s.diskUsage > 60 ? 'bg-yellow-500' : 'bg-emerald-500' },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-4">
              <span className="text-sm w-28">{r.label}</span>
              <div className="flex-1 bg-muted/50 rounded-full h-3 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${r.color}`} style={{ width: `${r.value}%` }} />
              </div>
              <span className="text-sm font-medium w-12 text-right">{r.value}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">System Info</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Event Queue Backlog</p>
            <p className="text-lg font-bold">{s.eventQueueBacklog}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Last Restart</p>
            <p className="text-sm font-medium">{formatTimestamp(s.lastRestart)}</p>
          </div>
          <div className="p-3 bg-muted/30 rounded-lg">
            <p className="text-xs text-muted-foreground">Cache Size</p>
            <p className="text-lg font-bold">{s.cacheSize}</p>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm(`Clear all in-memory caches (${s.cacheSize})? Subsequent requests will be slower until caches re-warm.`)) {
                toast({ title: 'Cache cleared', description: `${s.cacheSize} of cached data was flushed.` });
              }
            }}
            data-testid="button-clear-cache"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Clear Cache
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm('Restart the SnapFort runtime? Active sessions will reconnect automatically. Continue?')) {
                toast({
                  title: 'System restart scheduled',
                  description: 'Restart command sent. Estimated downtime: <30s.',
                  variant: 'destructive',
                });
              }
            }}
            data-testid="button-restart-system"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> System Restart
          </Button>
        </div>
      </div>
    </div>
  );
}

function AdvancedSection({ settings, onUpdate, isDirty, onSave, onReset }: SectionProps<'advanced'>) {
  const s = settings;
  const u = (field: string, value: any) => onUpdate(field, value);

  return (
    <div className="space-y-6">
      <SectionHeader icon={SETTINGS_SECTIONS[13].icon} title="Advanced" description="Advanced platform configuration" isDirty={isDirty} onSave={onSave} onReset={onReset} saving={false} />

      <div className="stat-card">
        <h3 className="font-medium mb-4">Display Preferences</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Timezone</Label>
            <Select value={s.timezone} onValueChange={(v) => u('timezone', v)}>
              <SelectTrigger data-testid="select-timezone"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="utc">UTC</SelectItem>
                <SelectItem value="est">Eastern (EST/EDT)</SelectItem>
                <SelectItem value="pst">Pacific (PST/PDT)</SelectItem>
                <SelectItem value="gmt">GMT</SelectItem>
                <SelectItem value="wat">West Africa (WAT)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date Format</Label>
            <Select value={s.dateFormat} onValueChange={(v) => u('dateFormat', v)}>
              <SelectTrigger data-testid="select-dateFormat"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="mdy">MM/DD/YYYY</SelectItem>
                <SelectItem value="dmy">DD/MM/YYYY</SelectItem>
                <SelectItem value="ymd">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div>
            <p className="font-medium text-sm">Compact View</p>
            <p className="text-xs text-muted-foreground">Show more data in less space</p>
          </div>
          <Switch checked={s.compactView} onCheckedChange={(v) => u('compactView', v)} data-testid="switch-compactView" />
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">API & Processing</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>API Endpoint</Label>
            <Input value={s.apiEndpoint} onChange={(e) => u('apiEndpoint', e.target.value)} data-testid="input-apiEndpoint" />
          </div>
          <div className="space-y-2">
            <Label>Max Concurrent Jobs</Label>
            <Input type="number" value={s.maxConcurrentJobs} onChange={(e) => u('maxConcurrentJobs', +e.target.value)} data-testid="input-maxJobs" />
          </div>
          <div className="space-y-2">
            <Label>Batch Processing Size</Label>
            <Input type="number" value={s.batchProcessingSize} onChange={(e) => u('batchProcessingSize', +e.target.value)} data-testid="input-batchSize" />
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="font-medium mb-4">Experimental</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Telemetry</p>
              <p className="text-xs text-muted-foreground">Send anonymous usage data to improve the platform</p>
            </div>
            <Switch checked={s.telemetryEnabled} onCheckedChange={(v) => u('telemetryEnabled', v)} data-testid="switch-telemetry" />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm text-yellow-600">Experimental Features</p>
              <p className="text-xs text-muted-foreground">Enable unstable features under development</p>
            </div>
            <Switch checked={s.experimentalFeatures} onCheckedChange={(v) => u('experimentalFeatures', v)} data-testid="switch-experimental" />
          </div>
        </div>
      </div>
    </div>
  );
}

type SectionProps<K extends SettingsSectionId> = {
  settings: AllSettings[K];
  onUpdate: (field: string, value: any) => void;
  isDirty: boolean;
  onSave: () => void;
  onReset: () => void;
};

const Settings = () => {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('risk');
  const [settings, setSettings] = useState<AllSettings>(() => deepClone(DEFAULT_SETTINGS));
  const [savedSettings, setSavedSettings] = useState<AllSettings>(() => deepClone(DEFAULT_SETTINGS));
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showConfirmSave, setShowConfirmSave] = useState(false);

  const isDirty = useCallback((section: SettingsSectionId) => {
    return JSON.stringify(settings[section]) !== JSON.stringify(savedSettings[section]);
  }, [settings, savedSettings]);

  const hasAnyUnsaved = SETTINGS_SECTIONS.some((s) => isDirty(s.id));

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasAnyUnsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasAnyUnsaved]);

  const updateField = useCallback((section: SettingsSectionId, field: string, value: any) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...prev[section], [field]: value },
    }));
  }, []);

  const saveSection = useCallback((section: SettingsSectionId) => {
    const oldData = savedSettings[section];
    const newData = settings[section];
    const entries: AuditEntry[] = [];

    for (const key of Object.keys(newData as any)) {
      const oldVal = JSON.stringify((oldData as any)[key]);
      const newVal = JSON.stringify((newData as any)[key]);
      if (oldVal !== newVal) {
        entries.push(createAuditEntry(section, key, oldVal, newVal));
      }
    }

    setSavedSettings((prev) => ({ ...prev, [section]: deepClone(settings[section]) }));
    setAuditLog((prev) => [...entries, ...prev]);
    toast({
      title: 'Settings saved',
      description: `${SETTINGS_SECTIONS.find((s) => s.id === section)?.label} updated successfully. ${entries.length} change(s) logged.`,
    });
  }, [settings, savedSettings, toast]);

  const resetSection = useCallback((section: SettingsSectionId) => {
    setSettings((prev) => ({ ...prev, [section]: deepClone(DEFAULT_SETTINGS[section]) }));
    setSavedSettings((prev) => ({ ...prev, [section]: deepClone(DEFAULT_SETTINGS[section]) }));
    toast({
      title: 'Settings reset',
      description: `${SETTINGS_SECTIONS.find((s) => s.id === section)?.label} reset to defaults.`,
    });
    setShowResetDialog(false);
  }, [toast]);

  const filteredSections = SETTINGS_SECTIONS.filter((s) =>
    s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sectionProps = (section: SettingsSectionId) => ({
    settings: settings[section] as any,
    onUpdate: (field: string, value: any) => updateField(section, field, value),
    isDirty: isDirty(section),
    onSave: () => {
      if (['security', 'environment', 'database'].includes(section) && isDirty(section)) {
        setShowConfirmSave(true);
      } else {
        saveSection(section);
      }
    },
    onReset: () => setShowResetDialog(true),
  });

  const renderSection = () => {
    switch (activeSection) {
      case 'risk': return <RiskSection {...sectionProps('risk')} />;
      case 'notifications': return <NotificationsSection {...sectionProps('notifications')} />;
      case 'compliance': return <ComplianceSection {...sectionProps('compliance')} />;
      case 'integrations': return <IntegrationsSection {...sectionProps('integrations')} />;
      case 'database': return <DatabaseSection {...sectionProps('database')} />;
      case 'model': return <ModelSection {...sectionProps('model')} />;
      case 'security': return <SecuritySection {...sectionProps('security')} />;
      case 'workflow': return <WorkflowSection {...sectionProps('workflow')} />;
      case 'audit': return <AuditSection {...sectionProps('audit')} auditLog={auditLog} />;
      case 'environment': return <EnvironmentSection {...sectionProps('environment')} />;
      case 'features': return <FeatureFlagsSection {...sectionProps('features')} />;
      case 'backup': return <BackupSection {...sectionProps('backup')} />;
      case 'health': return <SystemHealthSection settings={settings.health} />;
      case 'advanced': return <AdvancedSection {...sectionProps('advanced')} />;
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <Badge variant="outline" className="ml-2">Admin Only</Badge>
        </div>
        <p className="text-muted-foreground mt-1">Enterprise configuration center — all changes are audited</p>
      </div>

      <div className="flex gap-6">
        <div className="w-64 shrink-0">
          <div className="sticky top-4">
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search settings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
                data-testid="input-search-settings"
              />
            </div>
            <ScrollArea className="h-[calc(100vh-200px)]">
              <nav className="space-y-1">
                {filteredSections.map((section) => {
                  const Icon = section.icon;
                  const active = activeSection === section.id;
                  const dirty = isDirty(section.id);
                  return (
                    <button
                      key={section.id}
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                        active
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                      }`}
                      data-testid={`nav-${section.id}`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 truncate">{section.label}</span>
                      {dirty && <span className="h-2 w-2 rounded-full bg-yellow-500 shrink-0" />}
                    </button>
                  );
                })}
              </nav>
            </ScrollArea>
          </div>
        </div>

        <div className="flex-1 min-w-0 pb-8">
          {renderSection()}
        </div>
      </div>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reset all settings in "{SETTINGS_SECTIONS.find((s) => s.id === activeSection)?.label}" to their default values. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetSection(activeSection)}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showConfirmSave} onOpenChange={setShowConfirmSave}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Changes</DialogTitle>
            <DialogDescription>
              You are about to save changes to a critical section ({SETTINGS_SECTIONS.find((s) => s.id === activeSection)?.label}). These changes will take effect immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 bg-muted/30 rounded-lg text-sm">
            <p className="font-medium mb-2">Changes will be logged with:</p>
            <p className="text-muted-foreground">User: John Doe (admin@bank.com)</p>
            <p className="text-muted-foreground">Timestamp: {new Date().toLocaleString()}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmSave(false)}>Cancel</Button>
            <Button onClick={() => { saveSection(activeSection); setShowConfirmSave(false); }}>
              Confirm & Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
