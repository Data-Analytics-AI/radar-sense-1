import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft, Eye, EyeOff, Sparkles, Loader2, RefreshCw, ShieldAlert,
  Briefcase, FileSignature, ShieldX, Send, MessageSquare,
  UserCircle2, Building2, AlertTriangle, CheckCircle2, ExternalLink,
  Wallet, Smartphone, Globe2, Activity, Network as NetworkIcon,
  TrendingUp, FileText, ScrollText, AlertOctagon, Bot, User,
  ArrowUpRight, UserPlus, Download, Crown, Calculator, ChevronRight,
  ZoomIn, ZoomOut, Maximize2, Plus, Minus, Bookmark, History,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { analyzeWithAIMeta } from '@/lib/ai';
import { useAIChat } from '@/hooks/useAIChat';
import {
  getCustomerById, computeRiskScore, getScreeningMatches,
  getRegulatoryReports, getFraudRegister, getEddCases,
  getCustomerDerivations, getCustomerSecondHop, getSyntheticTransactions,
  type Customer, type ScreeningRun, type SyntheticTxn,
} from '@/lib/compliance-data';
import { getCachedMockData } from '@/lib/mock-data';
import {
  recordCustomerAction, useCustomerRecord, ACTION_LABELS, CURRENT_ACTOR,
  type CustomerActionKind,
} from '@/lib/customer-actions';
import type { Case, Alert as AlertT } from '@/types';

const customerName = (c: Customer) => (c.type === 'individual' ? c.fullName : c.companyName);
const formatNGN = (n: number) =>
  '₦' + (n >= 1_000_000 ? (n / 1_000_000).toFixed(2) + 'M' : n.toLocaleString());

const _strHash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
};

const maskMid = (v: string, head = 3, tail = 2) =>
  !v ? '—' : v.length <= head + tail ? v : v.slice(0, head) + '•'.repeat(Math.max(4, v.length - head - tail)) + v.slice(-tail);

const RISK_META: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  high: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
};

const KYC_META: Record<string, string> = {
  verified: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  rejected: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  expired: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
};

export default function CustomerProfile() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const customer = useMemo(() => getCustomerById(id), [id]);
  const persisted = useCustomerRecord(id);
  const [reveal, setReveal] = useState(false);
  const [aiNarrative, setAiNarrative] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [extraScreeningRuns, setExtraScreeningRuns] = useState<ScreeningRun[]>([]);
  const [selectedTxn, setSelectedTxn] = useState<SyntheticTxn | null>(null);
  const [focusedNode, setFocusedNode] = useState<number | null>(null);
  const [hoveredNode, setHoveredNode] = useState<{ x: number; y: number; html: React.ReactNode } | null>(null);
  const [graphZoom, setGraphZoom] = useState(1);
  const [graphPan, setGraphPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [networkHops, setNetworkHops] = useState<1 | 2>(1);
  const [focusedEntity, setFocusedEntity] = useState<{ title: string; lines: string[] } | null>(null);
  const graphSvgRef = useRef<SVGSVGElement>(null);
  const [copilotInput, setCopilotInput] = useState('');
  const [reportExportedAt, setReportExportedAt] = useState<string | null>(null);
  const workspaceState = {
    frozen: !!persisted.state.blocked,
    escalated: !!persisted.state.caseOpened,
    investigatorAssigned: persisted.state.investigatorAssigned ?? null,
    strDrafted: !!persisted.state.strDrafted,
    eddRequested: !!persisted.state.eddRequested,
    watchlisted: !!persisted.state.watchlisted,
    reportExportedAt,
  };

  const baseRisk = useMemo(() => (customer ? computeRiskScore(customer) : null), [customer]);
  const persistedAdj = persisted.state.riskAdjustment ?? 0;
  const risk = useMemo(() => {
    if (!baseRisk) return null;
    const factors = [...baseRisk.factors];
    if (persistedAdj !== 0) {
      factors.push({
        name: 'Analyst review adjustments',
        weight: Math.abs(persistedAdj),
        impact: persistedAdj > 0 ? 'negative' : 'positive',
      });
    }
    const score = Math.max(0, Math.min(100, factors.reduce((s, f) => s + (f.impact === 'negative' ? f.weight : -f.weight), 50)));
    return { score, factors };
  }, [baseRisk, persistedAdj]);

  const derived = useMemo(() => (customer ? getCustomerDerivations(customer) : null), [customer]);

  const screening = useMemo(
    () => (customer ? getScreeningMatches().filter(s => s.customerId === customer.id) : []),
    [customer],
  );
  const reports = useMemo(
    () => (customer ? getRegulatoryReports().filter(r => r.customerId === customer.id) : []),
    [customer],
  );
  const fraudEntries = useMemo(
    () => (customer ? getFraudRegister().filter(f => f.customerId === customer.id) : []),
    [customer],
  );
  const eddCases = useMemo(
    () => (customer ? getEddCases().filter(e => e.customerId === customer.id) : []),
    [customer],
  );
  const customerCases = useMemo<Case[]>(() => {
    if (!customer) return [];
    return getCachedMockData().cases.filter(c => c.customerId === customer.id);
  }, [customer]);
  const customerTxns = useMemo<SyntheticTxn[]>(
    () => (customer ? getSyntheticTransactions(customer, 30) : []),
    [customer],
  );
  const customerAlerts = useMemo<AlertT[]>(() => {
    if (!customer) return [];
    return getCachedMockData().alerts.filter(a => a.customerId === customer.id);
  }, [customer]);

  const concerns = useMemo(() => {
    if (!customer) return [] as string[];
    const out: string[] = [];
    if (customer.pepFlag) out.push('Politically Exposed Person — enhanced monitoring required.');
    if (customer.sanctionFlag) out.push('Sanctions list match — immediate review required.');
    if (customer.fraudRiskFlag) out.push('Historical fraud signal on file.');
    if (customer.kycStatus !== 'verified') out.push(`KYC status is ${customer.kycStatus}.`);
    if (customer.identityConfidenceScore < 70) out.push(`Identity confidence only ${customer.identityConfidenceScore}%.`);
    if (derived && derived.behaviorRatio > 1.5) out.push('Activity exceeds expected profile by >50%.');
    if (screening.length) out.push(`${screening.length} active screening match(es).`);
    return out;
  }, [customer, derived, screening]);

  const generateAi = async (silent = false) => {
    if (!customer || !risk || !derived) return;
    setAiLoading(true);
    try {
      const ctx = {
        id: customer.id,
        name: customerName(customer),
        type: customer.type,
        riskScore: risk.score,
        riskLevel: customer.riskLevel,
        kycStatus: customer.kycStatus,
        pepFlag: customer.pepFlag,
        sanctionFlag: customer.sanctionFlag,
        eddStatus: customer.eddStatus,
        recentTxnCount: customerTxns.length,
        screeningHits: screening.length,
        openCases: customerCases.filter(c => c.status !== 'closed').length,
        expectedAnnualVolume: derived.expectedAnnualVolume,
        actualVolume: customer.totalVolume,
        concerns,
        riskFactors: risk.factors,
      };
      const meta = await analyzeWithAIMeta('customer_intel', ctx);
      setAiNarrative(meta.result);
      setAiProvider(
        meta.providerId
          ? (meta.providerLabel ?? 'AI') + (meta.fallbackUsed ? ' (fallback)' : '')
          : 'Deterministic',
      );
    } catch (e) {
      const verdict = risk.score >= 75 ? 'HIGH RISK' : risk.score >= 50 ? 'ELEVATED' : risk.score >= 25 ? 'MODERATE' : 'LOW';
      const ratio = derived.expectedAnnualVolume > 0 ? customer.totalVolume / derived.expectedAnnualVolume : 1;
      const delta = ratio > 1.5 ? `Activity ${(ratio * 100 - 100).toFixed(0)}% above expected profile`
        : ratio < 0.5 ? `Activity ${(100 - ratio * 100).toFixed(0)}% below expected profile`
        : `Activity tracks within expected band (${(ratio * 100).toFixed(0)}% of expected)`;
      const topDriver = concerns[0] ?? (screening.length > 0 ? `${screening.length} active screening match(es)` : `${customerTxns.length} recent transactions, ${customerCases.filter(c => c.status !== 'closed').length} open case(s)`);
      const next = risk.score >= 75 ? 'Escalate to senior compliance and queue STR draft'
        : risk.score >= 50 ? 'Open EDD review and request enhanced documentation'
        : 'Maintain routine monitoring and re-screen in 30 days';
      const fallback = [
        `- **Risk verdict:** ${verdict} (score ${risk.score}/100 for ${customerName(customer)})`,
        `- **Top driver:** ${topDriver}`,
        `- **Behavioral delta:** ${delta}`,
        `- **Recommended next action:** ${next}`,
      ].join('\n');
      setAiNarrative(fallback);
      setAiProvider('Deterministic (offline)');
      const msg = e instanceof Error ? e.message : 'Failed to generate brief';
      if (!silent) toast({ title: 'AI offline — local brief shown', description: msg, variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  useEffect(() => {
    if (customer) void generateAi(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // Reset graph interaction state when navigating between customer profiles
  useEffect(() => {
    setFocusedNode(null);
    setFocusedEntity(null);
    setHoveredNode(null);
    setGraphZoom(1);
    setGraphPan({ x: 0, y: 0 });
    setNetworkHops(1);
  }, [customer?.id]);

  const chat = useAIChat({
    onError: (msg) => toast({ title: 'Copilot error', description: msg, variant: 'destructive' }),
  });

  if (!customer || !risk || !derived || !baseRisk) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <UserCircle2 className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Customer not found</h2>
        <p className="text-muted-foreground text-sm">Customer "{id}" could not be located.</p>
        <Button onClick={() => navigate('/customers')} data-testid="button-back-to-customers">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Customers
        </Button>
      </div>
    );
  }

  const name = customerName(customer);
  const isInd = customer.type === 'individual';

  // ===== Quick actions =====
  const logAction = (action: CustomerActionKind, label: string, note: string, statePatch = {}) => {
    recordCustomerAction(customer.id, { actor: CURRENT_ACTOR, action, label, note }, statePatch);
  };
  const handleGenerateStr = () => {
    logAction('file_str', ACTION_LABELS.file_str, `STR draft created for ${name}.`, { strDrafted: true });
    toast({ title: 'STR drafted', description: `Suspicious Transaction Report draft created for ${name}. Available in Regulatory Reporting.` });
  };
  const handleEscalateCase = () => {
    logAction('open_case', ACTION_LABELS.open_case, 'Case escalated to senior compliance officer.', { caseOpened: true });
    toast({ title: 'Case escalated', description: 'Investigation escalated to senior compliance officer.' });
  };
  const handleFreezeAccount = () => {
    const next = !workspaceState.frozen;
    logAction(
      next ? 'block' : 'unblock',
      next ? ACTION_LABELS.block : ACTION_LABELS.unblock,
      next
        ? `Outbound transactions for ${customer.accountNumber} suspended pending review.`
        : `Outbound transactions for ${customer.accountNumber} re-enabled.`,
      { blocked: next },
    );
    toast({
      title: next ? 'Account frozen' : 'Account unfrozen',
      description: next
        ? `Outbound transactions for ${customer.accountNumber} suspended pending review.`
        : `Outbound transactions for ${customer.accountNumber} re-enabled.`,
    });
  };
  const handleToggleWatchlist = () => {
    const next = !workspaceState.watchlisted;
    logAction(
      next ? 'add_watchlist' : 'remove_watchlist',
      next ? ACTION_LABELS.add_watchlist : ACTION_LABELS.remove_watchlist,
      next
        ? `${name} added to internal watchlist for enhanced monitoring.`
        : `${name} removed from internal watchlist.`,
      { watchlisted: next },
    );
    toast({
      title: next ? 'Added to watchlist' : 'Removed from watchlist',
      description: next
        ? `${name} will appear under Watchlisted customers.`
        : `${name} no longer appears under Watchlisted customers.`,
    });
  };
  const handleSendForEdd = () => {
    logAction('send_edd', ACTION_LABELS.send_edd, `${name} routed to Enhanced Due Diligence queue.`, { eddRequested: true });
    toast({ title: 'Sent for EDD', description: `${name} routed to Enhanced Due Diligence queue.` });
  };
  const handleSendMessage = () => {
    logAction('message', ACTION_LABELS.message, `Internal note dispatched to ${derived.primaryAnalyst}.`);
    toast({ title: 'Message sent', description: `Note delivered to ${derived.primaryAnalyst}.` });
  };
  const handleAssignInvestigator = () => {
    logAction('assign_investigator', ACTION_LABELS.assign_investigator, `${derived.primaryAnalyst} assigned as lead investigator.`, { investigatorAssigned: derived.primaryAnalyst });
    toast({ title: 'Investigator assigned', description: `${derived.primaryAnalyst} assigned as lead investigator.` });
  };
  const handleExportReport = () => {
    const lines = [
      `# Customer Intelligence Report — ${name}`,
      `Generated: ${new Date().toISOString()}`,
      `Customer ID: ${customer.id}`,
      `Type: ${customer.type}  |  Risk: ${risk.score} (${customer.riskLevel})  |  KYC: ${customer.kycStatus}`,
      `EDD: ${customer.eddStatus}  |  Account: ${customer.accountNumber}`,
      ``,
      `## Concerns`,
      ...(concerns.length ? concerns.map(c => `- ${c}`) : ['- None']),
      ``,
      `## Risk Factors`,
      ...risk.factors.map(f => `- ${f.name}: ${f.impact === 'negative' ? '+' : '−'}${f.weight}`),
      ``,
      `## AI Brief`,
      aiNarrative || '(not yet generated)',
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${customer.id}_report.md`;
    a.click();
    URL.revokeObjectURL(url);
    const ts = new Date().toISOString();
    setReportExportedAt(ts);
    logAction('export_report', ACTION_LABELS.export_report, `Markdown report exported (${customer.id}_report.md).`);
    toast({ title: 'Report exported', description: 'Customer report downloaded as Markdown.' });
  };
  const handleRecalcRisk = () => {
    const newAdj = (persisted.state.riskAdjustment ?? 0) + 5;
    recordCustomerAction(
      customer.id,
      { actor: CURRENT_ACTOR, action: 'recalc_risk', label: ACTION_LABELS.recalc_risk, note: 'Manual analyst review factor applied (+5).' },
      { riskAdjustment: newAdj },
    );
    toast({ title: 'Risk recalculated', description: 'Manual analyst review factor applied. Score updated.' });
  };

  // ===== Run Screening (append to history) =====
  const handleRunScreening = () => {
    const next: ScreeningRun = {
      id: `SCR-${customer.id}-${Date.now()}`,
      ranAtDaysAgo: 0,
      source: 'World-Check (live re-screen)',
      status: 'clear',
      matchCount: 0,
    };
    setExtraScreeningRuns(prev => [next, ...prev]);
    recordCustomerAction(
      customer.id,
      { actor: CURRENT_ACTOR, action: 'run_screening', label: ACTION_LABELS.run_screening, note: 'Live re-screen returned no new matches.' },
      { lastScreeningStatus: 'cleared', lastScreeningAt: Date.now() },
    );
    toast({ title: 'Screening complete', description: 'Live re-screen returned no new matches.' });
  };

  const sendCopilot = (text: string) => {
    if (!text.trim() || chat.isLoading) return;
    const grounded = `You are analyzing customer ${customer.id} (${name}). ` +
      `Risk: ${risk.score}/${customer.riskLevel}; KYC: ${customer.kycStatus}; ` +
      `PEP: ${customer.pepFlag}; Sanctions: ${customer.sanctionFlag}; ` +
      `Open cases: ${customerCases.filter(c => c.status !== 'closed').length}; ` +
      `Recent transactions: ${customerTxns.length}; Screening hits: ${screening.length}. ` +
      `Concerns: ${concerns.join('; ') || 'none'}.\n\nAnalyst question: ${text}`;
    void chat.sendMessage(grounded);
  };

  const allScreeningRuns = [...extraScreeningRuns, ...derived.screeningHistory];

  const gaugeColor =
    risk.score >= 75 ? 'text-red-500' :
    risk.score >= 50 ? 'text-orange-500' :
    risk.score >= 25 ? 'text-amber-500' : 'text-emerald-500';
  const gaugeStroke =
    risk.score >= 75 ? 'stroke-red-500' :
    risk.score >= 50 ? 'stroke-orange-500' :
    risk.score >= 25 ? 'stroke-amber-500' : 'stroke-emerald-500';

  return (
    <div className="space-y-6 animate-fade-in" data-testid={`customer-profile-${customer.id}`}>
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/customers')} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> All Customers
        </Button>
        <Button variant="outline" size="sm" onClick={() => setReveal(r => !r)} data-testid="button-toggle-mask">
          {reveal ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
          {reveal ? 'Mask IDs' : 'Reveal IDs'}
        </Button>
      </div>

      {/* Header card */}
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex items-start gap-4 flex-1 min-w-[280px]">
            <div className="h-14 w-14 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              {isInd ? <UserCircle2 className="h-8 w-8" /> : <Building2 className="h-8 w-8" />}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-customer-name">{name}</h1>
              <div className="flex items-center gap-2 flex-wrap mt-1">
                <span className="text-xs font-mono text-muted-foreground">{customer.id}</span>
                <Badge variant="outline" className="text-[10px] capitalize">
                  {isInd ? 'Individual KYC' : 'Corporate KYB'}
                </Badge>
                <Badge variant="outline" className={cn('text-[10px] capitalize', KYC_META[customer.kycStatus])}>
                  KYC {customer.kycStatus}
                </Badge>
                <Badge variant="outline" className={cn('text-[10px] capitalize', RISK_META[customer.riskLevel])}>
                  {customer.riskLevel} risk
                </Badge>
                {customer.pepFlag && <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"><Crown className="h-3 w-3 mr-1" />PEP</Badge>}
                {customer.sanctionFlag && <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30"><ShieldAlert className="h-3 w-3 mr-1" />Sanctioned</Badge>}
                {customer.fraudRiskFlag && <Badge variant="outline" className="text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30">Fraud signal</Badge>}
                {customer.eddStatus !== 'not_required' && (
                  <Badge variant="outline" className="text-[10px] capitalize bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30">
                    EDD {customer.eddStatus.replace('_', ' ')}
                  </Badge>
                )}
                {workspaceState.watchlisted && (
                  <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30" data-testid="badge-watchlisted">
                    <Bookmark className="h-3 w-3 mr-1" />Watchlisted
                  </Badge>
                )}
                {workspaceState.frozen && (
                  <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" data-testid="badge-blocked">
                    <ShieldX className="h-3 w-3 mr-1" />Blocked
                  </Badge>
                )}
                {workspaceState.eddRequested && (
                  <Badge variant="outline" className="text-[10px] bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" data-testid="badge-edd-requested">
                    <FileSignature className="h-3 w-3 mr-1" />EDD requested
                  </Badge>
                )}
                {workspaceState.strDrafted && (
                  <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30" data-testid="badge-str-drafted">
                    <FileText className="h-3 w-3 mr-1" />STR drafted
                  </Badge>
                )}
                {workspaceState.escalated && (
                  <Badge variant="outline" className="text-[10px] bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30" data-testid="badge-case-opened">
                    <Briefcase className="h-3 w-3 mr-1" />Case opened
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
                <Detail label="Account" value={reveal ? customer.accountNumber : maskMid(customer.accountNumber, 3, 3)} mono />
                <Detail
                  label={isInd ? 'BVN' : 'CAC'}
                  value={isInd
                    ? (reveal ? customer.bvn : maskMid(customer.bvn, 3, 2))
                    : (reveal ? customer.cacNumber : maskMid(customer.cacNumber, 2, 2))}
                  mono
                />
                {isInd && customer.nin && (
                  <Detail label="NIN" value={reveal ? customer.nin : maskMid(customer.nin, 3, 2)} mono />
                )}
                {!isInd && <Detail label="TIN" value={reveal ? customer.tin : maskMid(customer.tin, 2, 2)} mono />}
                <Detail
                  label="Onboarded"
                  value={formatDistanceToNow(new Date(customer.onboardedAt), { addSuffix: true })}
                />
              </div>
            </div>
          </div>

          {/* Risk gauge */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative w-32 h-32">
              <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                <circle cx={60} cy={60} r={50} stroke="hsl(var(--muted))" strokeWidth={10} fill="none" />
                <circle
                  cx={60} cy={60} r={50}
                  className={gaugeStroke}
                  strokeWidth={10}
                  fill="none"
                  strokeDasharray={`${(risk.score / 100) * Math.PI * 100} ${Math.PI * 100}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn('text-3xl font-bold font-mono', gaugeColor)} data-testid="text-risk-score">
                  {risk.score}
                </span>
                <span className="text-[10px] text-muted-foreground uppercase">Risk</span>
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions — exactly 7 per spec */}
        <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-border" data-testid="quick-actions">
          <Button size="sm" variant="outline" onClick={handleGenerateStr} data-testid="button-action-generate-str">
            <FileText className="h-4 w-4 mr-1.5" /> Generate STR
          </Button>
          <Button size="sm" variant="outline" onClick={handleEscalateCase} data-testid="button-action-escalate">
            <ArrowUpRight className="h-4 w-4 mr-1.5" /> Escalate Case
          </Button>
          <Button size="sm" variant="outline" className="text-red-600" onClick={handleFreezeAccount} data-testid="button-action-freeze">
            <ShieldX className="h-4 w-4 mr-1.5" /> Freeze Account
          </Button>
          <Button size="sm" variant="outline" onClick={handleAssignInvestigator} data-testid="button-action-assign">
            <UserPlus className="h-4 w-4 mr-1.5" /> Assign Investigator
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportReport} data-testid="button-action-export-report">
            <Download className="h-4 w-4 mr-1.5" /> Export Report
          </Button>
          <Button size="sm" variant="outline" onClick={handleRecalcRisk} data-testid="button-action-recalc">
            <Calculator className="h-4 w-4 mr-1.5" /> Recalculate Risk
          </Button>
          <Button size="sm" variant="outline" onClick={handleRunScreening} data-testid="button-action-run-screening">
            <RefreshCw className="h-4 w-4 mr-1.5" /> Run Screening
          </Button>
          <Button
            size="sm"
            variant={workspaceState.watchlisted ? 'default' : 'outline'}
            onClick={handleToggleWatchlist}
            data-testid="button-action-watchlist"
          >
            <Bookmark className="h-4 w-4 mr-1.5" />
            {workspaceState.watchlisted ? 'On Watchlist' : 'Add to Watchlist'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSendForEdd}
            disabled={workspaceState.eddRequested}
            data-testid="button-action-send-edd"
          >
            <Send className="h-4 w-4 mr-1.5" />
            {workspaceState.eddRequested ? 'EDD Requested' : 'Send for EDD'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleSendMessage} data-testid="button-action-message">
            <MessageSquare className="h-4 w-4 mr-1.5" /> Message
          </Button>
        </div>
      </Card>

      {/* AI risk banner */}
      <Card className="p-4 border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-md bg-primary/15 text-primary flex-shrink-0">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                AI Customer Intelligence Brief
                {aiProvider && <Badge variant="outline" className="text-[10px]">{aiProvider}</Badge>}
              </h3>
              <Button size="sm" variant="ghost" onClick={() => generateAi()} disabled={aiLoading} data-testid="button-refresh-ai">
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Refresh
              </Button>
            </div>
            {aiLoading && !aiNarrative ? (
              <div className="space-y-2 mt-3">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ) : (
              <pre className="mt-2 text-sm whitespace-pre-wrap leading-relaxed font-sans" data-testid="text-ai-brief">
                {aiNarrative || '_No brief yet — click Refresh._'}
              </pre>
            )}
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="profile">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="profile" data-testid="tab-profile"><UserCircle2 className="h-4 w-4 mr-1.5" />Profile</TabsTrigger>
          <TabsTrigger value="transactions" data-testid="tab-transactions"><Activity className="h-4 w-4 mr-1.5" />Transactions</TabsTrigger>
          <TabsTrigger value="relationships" data-testid="tab-relationships"><NetworkIcon className="h-4 w-4 mr-1.5" />Relationships</TabsTrigger>
          <TabsTrigger value="cases" data-testid="tab-cases"><Briefcase className="h-4 w-4 mr-1.5" />Cases & Investigations</TabsTrigger>
          <TabsTrigger value="compliance" data-testid="tab-compliance"><ShieldAlert className="h-4 w-4 mr-1.5" />Screening & Compliance</TabsTrigger>
          <TabsTrigger value="copilot" data-testid="tab-copilot"><Bot className="h-4 w-4 mr-1.5" />AI Copilot</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Identity confidence</h3>
                <span className="text-xs font-mono" data-testid="text-identity-confidence">{customer.identityConfidenceScore}%</span>
              </div>
              <Progress
                value={customer.identityConfidenceScore}
                className={cn('h-2',
                  customer.identityConfidenceScore >= 85 ? '[&>div]:bg-emerald-500'
                    : customer.identityConfidenceScore >= 70 ? '[&>div]:bg-amber-500'
                    : '[&>div]:bg-red-500')}
                data-testid="progress-identity-confidence"
              />
              <p className="text-[11px] text-muted-foreground">
                Document, biometric, and watchlist verification combined. {customer.identityConfidenceScore < 70 ? 'Below threshold — consider EDD.' : customer.identityConfidenceScore < 85 ? 'Acceptable but monitor.' : 'Strong identity assurance.'}
              </p>

              {screening.length > 0 && (
                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5" /> Active screening matches ({screening.length})
                  </h4>
                  <div className="space-y-1.5">
                    {screening.slice(0, 5).map(s => (
                      <div key={s.id} className="flex items-center justify-between text-xs border border-border rounded-md px-2 py-1.5" data-testid={`profile-screening-${s.id}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="text-[9px] capitalize">{s.screeningType.replace('_', ' ')}</Badge>
                          <span className="truncate">{s.matchedName}</span>
                        </div>
                        <span className={cn('font-mono text-[11px]', s.confidence >= 90 ? 'text-red-600' : s.confidence >= 70 ? 'text-amber-600' : 'text-muted-foreground')}>{s.confidence}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h3 className="text-sm font-semibold border-t border-border pt-3">Identity</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                {isInd ? (
                  <>
                    <Detail label="Full Name" value={customer.fullName} />
                    <Detail label="DOB" value={customer.dob} />
                    <Detail label="Gender" value={customer.gender} />
                    <Detail label="Phone" value={customer.phone} mono />
                    <Detail label="Email" value={customer.email} />
                    <Detail label="Occupation" value={customer.occupation} />
                    <Detail label="Source of Funds" value={customer.sourceOfFunds} />
                    <Detail label="ID Type" value={`${customer.idType} ${reveal ? customer.idNumber : maskMid(customer.idNumber, 1, 2)}`} mono />
                  </>
                ) : (
                  <>
                    <Detail label="Company" value={customer.companyName} />
                    <Detail label="Industry" value={customer.industry} />
                    <Detail label="CAC" value={reveal ? customer.cacNumber : maskMid(customer.cacNumber, 2, 2)} mono />
                    <Detail label="TIN" value={reveal ? customer.tin : maskMid(customer.tin, 2, 2)} mono />
                    <Detail label="Registered" value={customer.registrationDate} />
                    <Detail label="Email" value={customer.contactEmail} />
                    <Detail label="Phone" value={customer.contactPhone} mono />
                    <Detail label="Source of Funds" value={customer.sourceOfFunds} />
                  </>
                )}
              </div>
              <div className="text-xs text-muted-foreground border-t border-border pt-2">
                <span className="font-medium text-foreground">Address:</span>{' '}
                {isInd
                  ? `${customer.address.street}, ${customer.address.city}, ${customer.address.state}, ${customer.address.country}`
                  : `${customer.businessAddress.street}, ${customer.businessAddress.city}, ${customer.businessAddress.state}, ${customer.businessAddress.country}`}
              </div>
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Primary analyst:</span> {derived.primaryAnalyst}
              </div>
            </Card>

            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Risk breakdown</h3>
              <div className="space-y-2">
                {risk.factors.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No risk factors triggered.</p>
                ) : (
                  risk.factors.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1">
                        {f.impact === 'negative'
                          ? <AlertTriangle className="h-3 w-3 text-red-500" />
                          : <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                        {f.name}
                      </span>
                      <span className={cn('font-mono font-medium', f.impact === 'negative' ? 'text-red-500' : 'text-emerald-600')}>
                        {f.impact === 'negative' ? '+' : '−'}{f.weight}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="border-t border-border pt-3 space-y-2">
                <h4 className="text-xs font-semibold">Behavior vs Expected</h4>
                <div className="text-xs flex items-center justify-between">
                  <span className="text-muted-foreground">Expected (annual)</span>
                  <span className="font-mono">{formatNGN(derived.expectedAnnualVolume)}</span>
                </div>
                <div className="text-xs flex items-center justify-between">
                  <span className="text-muted-foreground">Actual (lifetime)</span>
                  <span className="font-mono">{formatNGN(customer.totalVolume)}</span>
                </div>
                <Progress
                  value={Math.min(100, derived.behaviorRatio * 50)}
                  className={cn(
                    'h-2',
                    derived.behaviorRatio > 1.5 ? '[&>div]:bg-red-500'
                      : derived.behaviorRatio > 1 ? '[&>div]:bg-amber-500'
                        : '[&>div]:bg-emerald-500',
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  {derived.behaviorRatio > 1.5
                    ? 'Significantly above expected profile.'
                    : derived.behaviorRatio > 1
                      ? 'Slightly above expected profile.'
                      : 'Within expected profile.'}
                </p>
              </div>
            </Card>
          </div>

          {isInd && (
            <Card className="p-4 space-y-3">
              <h3 className="text-sm font-semibold">Channel usage (lifetime)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {(['mobile', 'web', 'pos', 'atm', 'branch'] as const).map(ch => {
                  const v = customer.channelUsage[ch];
                  return (
                    <div key={ch} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="capitalize text-muted-foreground">{ch}</span>
                        <span className="font-mono">{v}%</span>
                      </div>
                      <Progress value={v} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="p-4 space-y-3" data-testid="card-activity-log">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <History className="h-4 w-4" /> Activity log
              </h3>
              <span className="text-[11px] text-muted-foreground">
                {persisted.entries.length} action{persisted.entries.length === 1 ? '' : 's'} recorded
              </span>
            </div>
            {persisted.entries.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No quick actions taken yet. Actions you trigger from this profile (Add to Watchlist, Send for EDD, Generate STR, Block Account, etc.) will be recorded here and persist across sessions.
              </p>
            ) : (
              <ScrollArea className="max-h-72 pr-3">
                <ol className="space-y-2">
                  {persisted.entries.map(e => (
                    <li
                      key={e.id}
                      className="flex items-start gap-3 border border-border rounded-md p-2.5"
                      data-testid={`activity-${e.id}`}
                    >
                      <div className="h-7 w-7 rounded-md bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                        <Activity className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-medium">{e.label}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {formatDistanceToNow(new Date(e.ts), { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {e.actor}
                          {e.note ? ` · ${e.note}` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </ScrollArea>
            )}
          </Card>

          <Card className="p-4 space-y-3">
            <h3 className="text-sm font-semibold">Documents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {customer.documents.map(d => (
                <div key={d.id} className="border border-border rounded-md p-3 flex items-start gap-2" data-testid={`doc-${d.id}`}>
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{d.name}</p>
                    <p className="text-[10px] text-muted-foreground capitalize">{d.type.replace('_', ' ')}</p>
                  </div>
                  {d.verified ? (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                      <CheckCircle2 className="h-3 w-3 mr-0.5" /> Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
                      Pending
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </TabsContent>

        {/* Transactions */}
        <TabsContent value="transactions" className="mt-4">
          <Card className="p-0 overflow-hidden">
            {customerTxns.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No transactions on file.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b border-border">
                    <tr className="text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Txn ID</th>
                      <th className="px-3 py-2 font-medium">When</th>
                      <th className="px-3 py-2 font-medium">Channel</th>
                      <th className="px-3 py-2 font-medium">Merchant</th>
                      <th className="px-3 py-2 font-medium text-right">Amount</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium w-32">Risk</th>
                      <th className="px-3 py-2 font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerTxns.map(t => (
                      <tr
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        className="border-b border-border/60 hover-elevate cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        onClick={() => setSelectedTxn(t)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedTxn(t); } }}
                        data-testid={`txn-${t.id}`}
                      >
                        <td className="px-3 py-2 font-mono text-xs">{t.id}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(t.timestamp), { addSuffix: true })}
                        </td>
                        <td className="px-3 py-2 text-xs capitalize">{t.channel}</td>
                        <td className="px-3 py-2 text-xs truncate max-w-[200px]">{t.merchantName}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs">{formatNGN(t.amount)}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-[10px] capitalize">{t.status}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={t.riskScore}
                              className={cn(
                                'h-1.5 w-16',
                                t.riskScore >= 75 ? '[&>div]:bg-red-500' :
                                  t.riskScore >= 50 ? '[&>div]:bg-orange-500' :
                                    t.riskScore >= 25 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500',
                              )}
                            />
                            <span className="font-mono text-xs w-7 text-right">{t.riskScore}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2"><ChevronRight className="h-4 w-4 text-muted-foreground" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Relationships */}
        <TabsContent value="relationships" className="mt-4 space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold">Linked entity network</h3>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground" data-testid="graph-legend">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" /> Customer</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500/70 inline-block" /> Linked account</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rotate-45 bg-sky-500/70 inline-block" /> Device</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-500/70 inline-block" /> IP</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-fuchsia-500/70 inline-block" /> Beneficiary</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70 inline-block" /> Related cust.</span>
              </div>
            </div>
            {(() => {
              const VBW = 600, VBH = 360;
              const cx = 300, cy = 180, radius = 130;
              const peers = derived.linkedAccounts.slice(0, 6);
              const peerNodes = peers.map((p, i) => {
                const angle = (i / Math.max(peers.length, 1)) * Math.PI * 2 - Math.PI / 2;
                return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, peer: p, idx: i };
              });
              const innerR = 70;
              const devicesShown = derived.devices.slice(0, 2);
              const ipsShown = Array.from(new Set(customerTxns.map(t => t.ipAddress))).slice(0, 2);
              const benefShown = Array.from(new Set(customerTxns.map(t => t.merchantName))).filter(Boolean).slice(0, 2);
              type ExtraKind = 'device' | 'ip' | 'beneficiary' | 'relcust';
              const allExtras: { kind: ExtraKind; label: string; meta: string }[] = [
                ...devicesShown.map(d => ({ kind: 'device' as const, label: d.id.slice(-6), meta: `${d.type} · ${d.trusted ? 'trusted' : 'new'} · seen ${d.lastSeenDaysAgo}d ago` })),
                ...ipsShown.map(ip => ({ kind: 'ip' as const, label: ip, meta: `IP address · ${customerTxns.filter(t => t.ipAddress === ip).length} txn(s)` })),
                ...benefShown.map(b => ({ kind: 'beneficiary' as const, label: b.slice(0, 10), meta: `Beneficiary · ${customerTxns.filter(t => t.merchantName === b).length} txn(s)` })),
              ];
              const extraNodes = allExtras.map((e, i) => {
                const angle = (i / Math.max(allExtras.length, 1)) * Math.PI * 2 + Math.PI / 4;
                return { x: cx + Math.cos(angle) * innerR, y: cy + Math.sin(angle) * innerR, ...e };
              });
              // Second-hop nodes — real related entities pulled from the data layer
              const hop2Source = networkHops === 2 ? getCustomerSecondHop(customer) : [];
              const hop2ByParent = new Map<number, typeof hop2Source>();
              hop2Source.forEach(h => {
                const arr = hop2ByParent.get(h.parentLinkIndex) ?? [];
                arr.push(h);
                hop2ByParent.set(h.parentLinkIndex, arr);
              });
              const hop2Nodes = Array.from(hop2ByParent.entries()).flatMap(([parentIdx, items]) => {
                const pn = peerNodes[parentIdx];
                if (!pn) return [];
                const baseAngle = Math.atan2(pn.y - cy, pn.x - cx);
                return items.slice(0, 2).map((item, j) => {
                  const a = baseAngle + (items.length === 1 ? 0 : (j === 0 ? -0.35 : 0.35));
                  const r = 60;
                  return {
                    x: pn.x + Math.cos(a) * r,
                    y: pn.y + Math.sin(a) * r,
                    parent: parentIdx,
                    customerId: item.customerId,
                    customerName: item.customerName,
                    label: item.customerName.slice(0, 10),
                    relation: item.relation,
                    risk: item.risk,
                  };
                });
              });
              const colorFor = (k: ExtraKind) =>
                k === 'device' ? { fill: 'rgb(14 165 233 / 0.25)', stroke: 'rgb(14 165 233)' }
                  : k === 'ip' ? { fill: 'rgb(139 92 246 / 0.25)', stroke: 'rgb(139 92 246)' }
                  : k === 'beneficiary' ? { fill: 'rgb(217 70 239 / 0.25)', stroke: 'rgb(217 70 239)' }
                  : { fill: 'rgb(16 185 129 / 0.25)', stroke: 'rgb(16 185 129)' };
              const peerFill = (r: 'low' | 'medium' | 'high') => r === 'high' ? 'rgb(239 68 68 / 0.25)' : r === 'medium' ? 'rgb(245 158 11 / 0.25)' : 'rgb(16 185 129 / 0.2)';
              const peerStroke = (r: 'low' | 'medium' | 'high') => r === 'high' ? 'rgb(239 68 68)' : r === 'medium' ? 'rgb(245 158 11)' : 'rgb(16 185 129)';
              const lastActivity = (peerIdx: number) => {
                const t = customerTxns[peerIdx % Math.max(customerTxns.length, 1)];
                if (!t) return 'no recent activity';
                const d = new Date(t.timestamp);
                return Number.isNaN(d.getTime()) ? 'no recent activity' : formatDistanceToNow(d, { addSuffix: true });
              };
              const peerRiskScore = (peer: typeof peers[number], i: number) => {
                const base = peer.risk === 'high' ? 78 : peer.risk === 'medium' ? 52 : 22;
                return Math.min(99, Math.max(5, base + ((_strHash(peer.account + i) % 18) - 9)));
              };
              const showTooltip = (_e: React.MouseEvent | React.FocusEvent, x: number, y: number, html: React.ReactNode) => {
                const rect = graphSvgRef.current?.getBoundingClientRect();
                if (!rect) return;
                // Apply the same translate(VBW/2 + pan) scale(zoom) translate(-VBW/2) transform used on the <g>
                const tx = VBW / 2 + graphPan.x + (x - VBW / 2) * graphZoom;
                const ty = VBH / 2 + graphPan.y + (y - VBH / 2) * graphZoom;
                const px = (tx / VBW) * rect.width;
                const py = (ty / VBH) * rect.height;
                setHoveredNode({ x: px, y: py, html });
              };
              return (
                <div className="relative w-full select-none" style={{ height: 360 }}>
                  <div className="absolute top-2 right-2 z-10 flex flex-wrap items-center gap-1 bg-background/80 backdrop-blur border border-border rounded-md p-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setGraphZoom(z => Math.min(z + 0.25, 3))} data-testid="button-graph-zoom-in" aria-label="Zoom in"><ZoomIn className="h-3.5 w-3.5" /></Button>
                    <span className="text-[10px] font-mono w-9 text-center text-muted-foreground" data-testid="text-graph-zoom">{Math.round(graphZoom * 100)}%</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setGraphZoom(z => Math.max(z - 0.25, 0.5))} data-testid="button-graph-zoom-out" aria-label="Zoom out"><ZoomOut className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setGraphZoom(1); setGraphPan({ x: 0, y: 0 }); }} data-testid="button-graph-reset" aria-label="Reset view"><Maximize2 className="h-3.5 w-3.5" /></Button>
                    <span className="mx-1 h-5 w-px bg-border" />
                    <Button
                      variant={networkHops === 2 ? 'default' : 'outline'}
                      size="sm"
                      className="h-7 text-[11px] px-2"
                      onClick={() => setNetworkHops(h => h === 1 ? 2 : 1)}
                      data-testid="button-expand-network"
                    >
                      {networkHops === 2 ? <><Minus className="h-3 w-3 mr-1" />Collapse</> : <><Plus className="h-3 w-3 mr-1" />Expand network</>}
                    </Button>
                  </div>
                  <svg
                    ref={graphSvgRef}
                    viewBox={`0 0 ${VBW} ${VBH}`}
                    className={cn('w-full h-full rounded-md border border-border bg-card', isPanning ? 'cursor-grabbing' : 'cursor-grab')}
                    role="img"
                    aria-label={`Linked entity network for ${name}. ${peers.length} linked accounts, ${extraNodes.length} other entities${networkHops === 2 ? `, ${hop2Nodes.length} second-hop entities` : ''}.`}
                    onMouseDown={(e) => {
                      const tag = (e.target as Element).tagName;
                      if (tag === 'svg' || tag === 'rect' && (e.target as Element).getAttribute('data-bg') === '1') {
                        setIsPanning(true);
                        panStartRef.current = { x: e.clientX, y: e.clientY, ox: graphPan.x, oy: graphPan.y };
                      }
                    }}
                    onMouseMove={(e) => {
                      if (!isPanning || !panStartRef.current) return;
                      const rect = graphSvgRef.current?.getBoundingClientRect();
                      const sx = rect ? VBW / rect.width : 1;
                      const sy = rect ? VBH / rect.height : 1;
                      setGraphPan({
                        x: panStartRef.current.ox + (e.clientX - panStartRef.current.x) * sx,
                        y: panStartRef.current.oy + (e.clientY - panStartRef.current.y) * sy,
                      });
                    }}
                    onMouseUp={() => { setIsPanning(false); panStartRef.current = null; }}
                    onMouseLeave={() => { setIsPanning(false); panStartRef.current = null; setHoveredNode(null); }}
                    onWheel={(e) => {
                      e.preventDefault();
                      setGraphZoom(z => Math.max(0.5, Math.min(3, z + (e.deltaY < 0 ? 0.15 : -0.15))));
                    }}
                  >
                    <rect data-bg="1" x={0} y={0} width={VBW} height={VBH} fill="transparent" />
                    <g transform={`translate(${VBW / 2 + graphPan.x} ${VBH / 2 + graphPan.y}) scale(${graphZoom}) translate(${-VBW / 2} ${-VBH / 2})`}>
                      {peerNodes.map((n) => (
                        <line
                          key={`l-${n.idx}`}
                          x1={cx} y1={cy} x2={n.x} y2={n.y}
                          stroke={focusedNode === n.idx ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
                          strokeWidth={focusedNode === n.idx ? 2.5 : 1.5}
                          strokeDasharray="4 3"
                        />
                      ))}
                      {extraNodes.map((n, i) => (
                        <line key={`el-${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
                      ))}
                      {hop2Nodes.map((n, i) => (
                        <line key={`h2l-${i}`} x1={peerNodes[n.parent].x} y1={peerNodes[n.parent].y} x2={n.x} y2={n.y} stroke="hsl(var(--border))" strokeWidth={1} strokeDasharray="2 4" opacity={0.6} />
                      ))}
                      {extraNodes.map((n, i) => {
                        const c = colorFor(n.kind);
                        const tip = (
                          <>
                            <p className="font-medium capitalize">{n.kind}</p>
                            <p className="text-muted-foreground">{n.label}</p>
                            <p className="text-muted-foreground">{n.meta}</p>
                          </>
                        );
                        const openExtra = () => setFocusedEntity({
                          title: `${n.kind.charAt(0).toUpperCase()}${n.kind.slice(1)}: ${n.label}`,
                          lines: [n.meta],
                        });
                        const common = {
                          tabIndex: 0,
                          role: 'button' as const,
                          'aria-label': `${n.kind} ${n.label}. Press Enter to view details.`,
                          onMouseEnter: (e: React.MouseEvent) => showTooltip(e, n.x, n.y - 18, tip),
                          onMouseLeave: () => setHoveredNode(null),
                          onFocus: (e: React.FocusEvent) => showTooltip(e, n.x, n.y - 18, tip),
                          onBlur: () => setHoveredNode(null),
                          onClick: openExtra,
                          onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openExtra(); } },
                          'data-testid': `graph-extra-${n.kind}-${i}`,
                          style: { cursor: 'pointer', outline: 'none' },
                        };
                        if (n.kind === 'device') {
                          return (
                            <g key={`en-${i}`} {...common}>
                              <rect x={n.x - 10} y={n.y - 10} width={20} height={20} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} transform={`rotate(45 ${n.x} ${n.y})`} />
                              <text x={n.x} y={n.y + 22} textAnchor="middle" className="text-[8px] fill-muted-foreground pointer-events-none">{n.label}</text>
                            </g>
                          );
                        }
                        if (n.kind === 'beneficiary') {
                          return (
                            <g key={`en-${i}`} {...common}>
                              <rect x={n.x - 12} y={n.y - 9} width={24} height={18} rx={3} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
                              <text x={n.x} y={n.y + 22} textAnchor="middle" className="text-[8px] fill-muted-foreground pointer-events-none">{n.label}</text>
                            </g>
                          );
                        }
                        return (
                          <g key={`en-${i}`} {...common}>
                            <circle cx={n.x} cy={n.y} r={11} fill={c.fill} stroke={c.stroke} strokeWidth={1.5} />
                            <text x={n.x} y={n.y + 22} textAnchor="middle" className="text-[8px] fill-muted-foreground pointer-events-none">{n.label}</text>
                          </g>
                        );
                      })}
                      {hop2Nodes.map((n, i) => {
                        const tip = (
                          <>
                            <p className="font-medium">{n.customerName}</p>
                            <p className="text-muted-foreground">2nd hop via {peers[n.parent].bank}</p>
                            <p className="text-muted-foreground">{n.relation} · risk {n.risk}</p>
                            <p className="text-[10px] text-muted-foreground/80 mt-1">Click to open profile</p>
                          </>
                        );
                        const openHop2 = () => navigate(`/customers/${n.customerId}`);
                        return (
                        <g key={`h2-${i}`}
                          tabIndex={0}
                          role="button"
                          aria-label={`Second-hop entity ${n.customerName} linked via ${peers[n.parent].bank}. Press Enter to open profile.`}
                          style={{ cursor: 'pointer', outline: 'none' }}
                          onMouseEnter={(e) => showTooltip(e, n.x, n.y - 14, tip)}
                          onMouseLeave={() => setHoveredNode(null)}
                          onFocus={(e) => showTooltip(e, n.x, n.y - 14, tip)}
                          onBlur={() => setHoveredNode(null)}
                          onClick={openHop2}
                          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHop2(); } }}
                          data-testid={`graph-hop2-${i}`}
                        >
                          <circle cx={n.x} cy={n.y} r={8} fill={peerFill(n.risk)} stroke={peerStroke(n.risk)} strokeWidth={1} opacity={0.85} />
                          <text x={n.x} y={n.y + 18} textAnchor="middle" className="text-[7px] fill-muted-foreground pointer-events-none">{n.label}</text>
                        </g>
                      ); })}
                      <g
                        tabIndex={0}
                        role="button"
                        aria-label={`This customer ${name}. Press Enter to view details.`}
                        onMouseEnter={(e) => showTooltip(e, cx, cy - 42, (
                          <>
                            <p className="font-medium">{name}</p>
                            <p className="text-muted-foreground">{customer.id} · risk {risk.score}/100</p>
                            <p className="text-muted-foreground">{customerTxns.length} txn(s) tracked · {derived.devices.length} device(s)</p>
                          </>
                        ))}
                        onMouseLeave={() => setHoveredNode(null)}
                        onFocus={(e) => showTooltip(e, cx, cy - 42, (
                          <>
                            <p className="font-medium">{name}</p>
                            <p className="text-muted-foreground">{customer.id} · risk {risk.score}/100</p>
                          </>
                        ))}
                        onBlur={() => setHoveredNode(null)}
                        onClick={() => setFocusedEntity({
                          title: `${name} (this customer)`,
                          lines: [`${customer.id} · risk ${risk.score}/100`, `${customerTxns.length} txn(s) tracked`, `${derived.devices.length} device(s) on file`],
                        })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setFocusedEntity({
                              title: `${name} (this customer)`,
                              lines: [`${customer.id} · risk ${risk.score}/100`, `${customerTxns.length} txn(s) tracked`],
                            });
                          }
                        }}
                        style={{ cursor: 'pointer', outline: 'none' }}
                        data-testid="graph-node-self"
                      >
                        <circle cx={cx} cy={cy} r={36} fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth={2} />
                        <text x={cx} y={cy - 2} textAnchor="middle" className="text-[11px] fill-foreground font-medium pointer-events-none">{name.slice(0, 14)}</text>
                        <text x={cx} y={cy + 12} textAnchor="middle" className="text-[10px] fill-muted-foreground pointer-events-none">{customer.id}</text>
                      </g>
                      {peerNodes.map((n) => {
                        const i = n.idx;
                        const isFocused = focusedNode === i;
                        const score = peerRiskScore(n.peer, i);
                        const last = lastActivity(i);
                        const tip = (
                          <>
                            <p className="font-medium">{n.peer.bank}</p>
                            <p className="text-muted-foreground">Account: {reveal ? n.peer.account : maskMid(n.peer.account, 3, 3)}</p>
                            <p className="text-muted-foreground">Relation: {n.peer.relation}</p>
                            <p className="text-muted-foreground">Risk: <span className="capitalize">{n.peer.risk}</span> ({score}/100)</p>
                            <p className="text-muted-foreground">Last activity: {last}</p>
                            <p className="text-[10px] text-muted-foreground/80 mt-1">Click to focus · Enter to open</p>
                          </>
                        );
                        return (
                          <g
                            key={`n-${i}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`Linked account ${n.peer.bank}, ${n.peer.relation}, ${n.peer.risk} risk. Press Enter to focus, Shift+Enter to open related customer.`}
                            style={{ cursor: 'pointer', outline: 'none' }}
                            onClick={() => setFocusedNode(isFocused ? null : i)}
                            onMouseEnter={(e) => showTooltip(e, n.x, n.y - 36, tip)}
                            onMouseLeave={() => setHoveredNode(null)}
                            onFocus={(e) => showTooltip(e, n.x, n.y - 36, tip)}
                            onBlur={() => setHoveredNode(null)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                if (e.shiftKey) {
                                  if (n.peer.relatedCustomerId) navigate(`/customers/${n.peer.relatedCustomerId}`);
                                } else {
                                  setFocusedNode(isFocused ? null : i);
                                }
                              } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                                e.preventDefault();
                                const next = (i + 1) % peerNodes.length;
                                (graphSvgRef.current?.querySelector(`[data-testid="graph-node-${next}"]`) as HTMLElement | null)?.focus();
                              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                                e.preventDefault();
                                const prev = (i - 1 + peerNodes.length) % peerNodes.length;
                                (graphSvgRef.current?.querySelector(`[data-testid="graph-node-${prev}"]`) as HTMLElement | null)?.focus();
                              } else if (e.key === 'Escape') {
                                setFocusedNode(null);
                              }
                            }}
                            data-testid={`graph-node-${i}`}
                          >
                            <circle cx={n.x} cy={n.y} r={isFocused ? 32 : 28} fill={peerFill(n.peer.risk)} stroke={peerStroke(n.peer.risk)} strokeWidth={isFocused ? 2.5 : 1.5} />
                            <text x={n.x} y={n.y - 2} textAnchor="middle" className="text-[10px] fill-foreground font-medium pointer-events-none">{n.peer.bank}</text>
                            <text x={n.x} y={n.y + 10} textAnchor="middle" className="text-[9px] fill-muted-foreground pointer-events-none">{n.peer.relation}</text>
                          </g>
                        );
                      })}
                    </g>
                  </svg>
                  {hoveredNode && (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full bg-popover text-popover-foreground border border-border rounded-md shadow-md px-2.5 py-1.5 text-[11px] whitespace-nowrap max-w-[260px]"
                      style={{ left: hoveredNode.x, top: hoveredNode.y - 6 }}
                      data-testid="graph-tooltip"
                    >
                      {hoveredNode.html}
                    </div>
                  )}
                </div>
              );
            })()}
            {focusedEntity && (
              <div className="mt-3 p-3 border border-border bg-muted/30 rounded-md text-xs space-y-1" data-testid="graph-entity-detail">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{focusedEntity.title}</span>
                  <button
                    type="button"
                    onClick={() => setFocusedEntity(null)}
                    className="text-muted-foreground hover:text-foreground"
                    data-testid="button-clear-entity"
                  >Clear</button>
                </div>
                {focusedEntity.lines.map((l, i) => (
                  <p key={i} className="text-muted-foreground">{l}</p>
                ))}
              </div>
            )}
            {focusedNode !== null && derived.linkedAccounts[focusedNode] && (() => {
              const peer = derived.linkedAccounts[focusedNode];
              const target = peer.relatedCustomerId ? getCustomerById(peer.relatedCustomerId) : undefined;
              const score = (peer.risk === 'high' ? 78 : peer.risk === 'medium' ? 52 : 22) + ((_strHash(peer.account + focusedNode) % 18) - 9);
              const last = customerTxns[focusedNode % Math.max(customerTxns.length, 1)];
              return (
                <div className="mt-3 p-3 border border-primary/30 bg-primary/5 rounded-md text-xs space-y-1.5" data-testid="graph-focus-detail">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Focused: {peer.bank}</span>
                    <button
                      type="button"
                      onClick={() => setFocusedNode(null)}
                      className="text-muted-foreground hover:text-foreground"
                      data-testid="button-clear-focus"
                    >Clear</button>
                  </div>
                  <p className="font-mono">{reveal ? peer.account : maskMid(peer.account, 3, 3)}</p>
                  <p className="text-muted-foreground">Relation: {peer.relation} · Risk: <span className="capitalize">{peer.risk}</span> ({Math.max(5, Math.min(99, score))}/100)</p>
                  {last && <p className="text-muted-foreground">Last activity: {formatDistanceToNow(new Date(last.timestamp), { addSuffix: true })} · {formatNGN(last.amount)}</p>}
                  {target && (
                    <p className="text-muted-foreground">Linked customer: <span className="font-medium text-foreground">{target.type === 'individual' ? target.fullName : target.companyName}</span> ({target.id})</p>
                  )}
                  <div className="pt-1.5 flex flex-wrap gap-2">
                    {target ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => navigate(`/customers/${target.id}`)}
                        data-testid="button-open-related-customer"
                      >
                        <ExternalLink className="h-3 w-3 mr-1" /> Open {target.type === 'individual' ? target.fullName.split(' ')[0] : target.companyName}
                      </Button>
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">External beneficiary — no internal customer record</span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-[11px]"
                      onClick={() => setNetworkHops(h => h === 1 ? 2 : 1)}
                      data-testid="button-toggle-hops-from-detail"
                    >
                      {networkHops === 2 ? 'Collapse network' : 'Expand one more hop'}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Linked accounts
              </h3>
              <div className="space-y-2">
                {derived.linkedAccounts.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-xs border border-border rounded-md p-2" data-testid={`linked-account-${i}`}>
                    <div>
                      <p className="font-mono">{reveal ? a.account : maskMid(a.account, 3, 3)}</p>
                      <p className="text-muted-foreground">{a.bank} · {a.relation}</p>
                    </div>
                    <Badge variant="outline" className={cn('text-[10px] capitalize', RISK_META[a.risk])}>{a.risk}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Smartphone className="h-4 w-4" /> Devices
              </h3>
              <div className="space-y-2">
                {derived.devices.map(d => (
                  <div key={d.id} className="flex items-center justify-between text-xs border border-border rounded-md p-2">
                    <div>
                      <p className="font-medium">{d.type}</p>
                      <p className="text-muted-foreground font-mono">{d.id}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className={cn('text-[10px]', d.trusted
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30')}>
                        {d.trusted ? 'Trusted' : 'New'}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {d.lastSeenDaysAgo === 0 ? 'today' : `${d.lastSeenDaysAgo}d ago`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {!isInd && (customer.directors.length > 0 || customer.ubos.length > 0) && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3">Directors & UBOs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="text-xs font-medium mb-2">Directors</p>
                  <div className="space-y-1">
                    {customer.directors.map((d, i) => (
                      <div key={i} className="text-xs flex items-center justify-between border border-border rounded-md p-2">
                        <span>{d.name} <span className="text-muted-foreground">({d.position})</span></span>
                        <span className="font-mono text-muted-foreground">
                          {d.shareholdingPct}% {d.pepFlag && <Badge variant="outline" className="text-[10px] ml-1 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">PEP</Badge>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium mb-2">Ultimate Beneficial Owners</p>
                  <div className="space-y-1">
                    {customer.ubos.map((u, i) => (
                      <div key={i} className="text-xs flex items-center justify-between border border-border rounded-md p-2">
                        <span>{u.name}</span>
                        <span className="font-mono text-muted-foreground">{u.ownershipPct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Cases & Investigations */}
        <TabsContent value="cases" className="mt-4 space-y-4">
          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Cases
            </h3>
            {customerCases.length === 0 ? (
              <p className="text-xs text-muted-foreground">No cases linked to this customer.</p>
            ) : (
              <div className="space-y-2">
                {customerCases.map(c => (
                  <div
                    key={c.id}
                    role="link"
                    tabIndex={0}
                    className="flex items-center justify-between border border-border rounded-md p-3 cursor-pointer hover-elevate focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => navigate(`/cases/${c.id}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/cases/${c.id}`); } }}
                    data-testid={`case-${c.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-[10px] capitalize">{c.status.replace('_', ' ')}</Badge>
                      <div>
                        <p className="text-sm font-medium font-mono">{c.id}</p>
                        <p className="text-xs text-muted-foreground capitalize">{c.type} · {c.priority} priority</p>
                      </div>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </Card>

          {eddCases.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <FileSignature className="h-4 w-4" /> EDD cases
              </h3>
              <div className="space-y-2">
                {eddCases.map(e => (
                  <div key={e.id} className="border border-border rounded-md p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{e.id}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{e.status.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-muted-foreground">Triggers: {e.triggerReason.join(', ')}</p>
                    <p className="text-muted-foreground">Source of wealth: {e.sourceOfWealth}</p>
                    <p className="text-[11px] text-muted-foreground">Due {format(new Date(e.dueDate), 'PP')}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Linked alerts
            </h3>
            {customerAlerts.length === 0 && reports.length === 0 ? (
              <p className="text-xs text-muted-foreground">No alerts or STR/CTR filings linked to this customer.</p>
            ) : (
              <div className="space-y-2">
                {customerAlerts.slice(0, 8).map(a => (
                  <div key={a.id} className="flex items-center justify-between border border-border rounded-md p-2 text-xs" data-testid={`alert-${a.id}`}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={cn('text-[10px] capitalize',
                        a.severity === 'critical' || a.severity === 'high'
                          ? 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30'
                          : a.severity === 'medium'
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30')}>
                        {a.severity}
                      </Badge>
                      <span className="font-mono text-[11px]">{a.id}</span>
                      <span className="text-muted-foreground truncate max-w-[200px]">{a.description}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">{a.status.replace('_', ' ')}</Badge>
                  </div>
                ))}
                {reports.filter(r => r.type === 'STR').map(r => (
                  <div key={r.id} className="flex items-center justify-between border border-border rounded-md p-2 text-xs" data-testid={`linked-str-${r.id}`}>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30">STR</Badge>
                      <span className="font-mono text-[11px]">{r.id}</span>
                      <span className="text-muted-foreground truncate max-w-[200px]">{r.reason}</span>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">{r.status.replace('_', ' ')}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {fraudEntries.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <AlertOctagon className="h-4 w-4" /> Fraud register entries
              </h3>
              <div className="space-y-2">
                {fraudEntries.map(f => (
                  <div key={f.id} className="border border-border rounded-md p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{f.id}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">{f.fraudType.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-muted-foreground mt-1">{f.description}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-muted-foreground">{format(new Date(f.incidentDate), 'PP')}</span>
                      <span className="font-mono text-red-500">−{formatNGN(f.amountLost - f.amountRecovered)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Compliance */}
        <TabsContent value="compliance" className="mt-4 space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" /> Screening matches
              </h3>
              <Button size="sm" variant="outline" onClick={handleRunScreening} data-testid="button-run-screening-tab">
                <RefreshCw className="h-4 w-4 mr-1.5" /> Run Screening
              </Button>
            </div>
            {screening.length === 0 ? (
              <p className="text-xs text-muted-foreground">No live screening matches.</p>
            ) : (
              <div className="space-y-2">
                {screening.map(s => (
                  <div key={s.id} className="border border-border rounded-md p-3 text-xs space-y-1" data-testid={`screening-${s.id}`}>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] capitalize">{s.screeningType.replace('_', ' ')}</Badge>
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        <Globe2 className="h-3 w-3" /> {s.jurisdiction}
                      </span>
                    </div>
                    <p className="font-medium">{s.matchedName}</p>
                    <p className="text-muted-foreground">{s.matchedListSource} · {s.matchType}</p>
                    <div className="flex items-center gap-2">
                      <Progress
                        value={s.confidence}
                        className={cn(
                          'h-1.5 w-24',
                          s.confidence >= 90 ? '[&>div]:bg-red-500' :
                            s.confidence >= 75 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500',
                        )}
                      />
                      <span className="font-mono">{s.confidence}%</span>
                      <Badge variant="outline" className="text-[10px] capitalize ml-auto">{s.status.replace('_', ' ')}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Confidence trend
              </h3>
              <span className="text-[11px] text-muted-foreground">Last {Math.max(allScreeningRuns.length, screening.length)} screenings</span>
            </div>
            {(() => {
              const trendPoints: number[] = [];
              [...allScreeningRuns].reverse().forEach(r => {
                trendPoints.push(r.status === 'matches_found' ? 70 + r.matchCount * 8 : 10);
              });
              screening.forEach(s => trendPoints.push(s.confidence));
              const pts = trendPoints.length > 0 ? trendPoints : [10];
              const w = 320, h = 60, max = 100, step = pts.length > 1 ? w / (pts.length - 1) : 0;
              const path = pts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${(i * step).toFixed(1)} ${(h - (v / max) * (h - 8) - 4).toFixed(1)}`).join(' ');
              const last = pts[pts.length - 1];
              const stroke = last >= 75 ? '#ef4444' : last >= 40 ? '#f59e0b' : '#10b981';
              return (
                <div className="flex items-end gap-3">
                  <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" className="max-w-[320px]" aria-label="Screening confidence trend sparkline">
                    <path d={path} fill="none" stroke={stroke} strokeWidth="2" />
                    {pts.map((v, i) => (
                      <circle key={i} cx={(i * step).toFixed(1)} cy={(h - (v / max) * (h - 8) - 4).toFixed(1)} r="2" fill={stroke} />
                    ))}
                  </svg>
                  <div className="text-xs">
                    <p className="font-mono text-base" style={{ color: stroke }}>{last.toFixed(0)}%</p>
                    <p className="text-[10px] text-muted-foreground">latest</p>
                  </div>
                </div>
              );
            })()}
          </Card>

          <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <ScrollText className="h-4 w-4" /> Screening history
            </h3>
            <div className="space-y-2">
              {allScreeningRuns.map(run => (
                <div key={run.id} className="flex items-center justify-between border border-border rounded-md p-2 text-xs" data-testid={`screening-run-${run.id}`}>
                  <div>
                    <p className="font-medium">{run.source}</p>
                    <p className="text-muted-foreground">{run.ranAtDaysAgo === 0 ? 'just now' : `${run.ranAtDaysAgo} days ago`}</p>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px]',
                    run.status === 'matches_found'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
                  )}>
                    {run.status === 'matches_found' ? `${run.matchCount} match` : 'Clear'}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>

          {reports.length > 0 && (
            <Card className="p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ScrollText className="h-4 w-4" /> Regulatory reports
              </h3>
              <div className="space-y-2">
                {reports.map(r => (
                  <div key={r.id} className="border border-border rounded-md p-3 text-xs" data-testid={`report-${r.id}`}>
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{r.id}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">{r.status.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                    <p className="text-muted-foreground mt-1">{r.reason}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                      <span className="font-mono">{formatNGN(r.amount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* AI Copilot — uses SSE chat hook */}
        <TabsContent value="copilot" className="mt-4">
          <Card className="p-0 overflow-hidden h-[60vh] flex flex-col">
            <div className="p-3 border-b border-border bg-muted/40">
              <p className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Customer-scoped AI Copilot
              </p>
              <p className="text-[11px] text-muted-foreground">Streaming responses grounded in this customer's profile.</p>
            </div>
            <ScrollArea className="flex-1 p-4">
              {chat.messages.length === 0 ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Try a suggested prompt:</p>
                  {[
                    'Summarize this customer\'s KYC profile, risk drivers, and recent behavior.',
                    'What red flags or anomalies appear in their transaction patterns?',
                    'Are there suspicious links to other customers, accounts, devices, or IPs?',
                    'Recommend next investigative actions and the evidence we still need.',
                    'Should we file a Suspicious Transaction Report? Justify with specific signals.',
                    'Draft a customer-outreach script for an adverse-action / EDD notice.',
                  ].map((q, i) => (
                    <button
                      key={i}
                      type="button"
                      className="block w-full text-left text-xs p-2.5 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all"
                      onClick={() => sendCopilot(q)}
                      data-testid={`button-suggested-copilot-${i}`}
                    >
                      <TrendingUp className="inline h-3 w-3 text-primary mr-1" /> {q}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {chat.messages.map((m, i) => (
                    <div key={i} className={cn('flex gap-2', m.role === 'user' && 'flex-row-reverse')} data-testid={`copilot-${m.role}-${i}`}>
                      <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                        m.role === 'assistant' ? 'bg-primary/15 text-primary' : 'bg-muted')}>
                        {m.role === 'assistant' ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                      </div>
                      <div className={cn('rounded-lg p-3 max-w-[85%] text-xs whitespace-pre-wrap',
                        m.role === 'assistant' ? 'bg-muted/40 border border-border' : 'bg-primary/10 border border-primary/20')}>
                        {m.role === 'user'
                          ? (m.content.split('Analyst question: ')[1] ?? m.content)
                          : (m.isStreaming && !m.content
                            ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            : (m.content || '_(empty)_'))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <form
              className="p-3 border-t border-border flex gap-2"
              onSubmit={(e) => { e.preventDefault(); const v = copilotInput.trim(); if (!v) return; setCopilotInput(''); sendCopilot(v); }}
            >
              <Textarea
                value={copilotInput}
                onChange={e => setCopilotInput(e.target.value)}
                placeholder="Ask about this customer…"
                className="min-h-[40px] max-h-[120px] resize-none"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const v = copilotInput.trim();
                    if (v) { setCopilotInput(''); sendCopilot(v); }
                  }
                }}
                data-testid="input-copilot"
              />
              <Button type="submit" disabled={chat.isLoading || !copilotInput.trim()} data-testid="button-send-copilot">
                {chat.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </Card>
          {chat.messages.length > 0 && (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => chat.clearMessages()} data-testid="button-clear-copilot">
              <MessageSquare className="h-4 w-4 mr-1.5" /> Clear conversation
            </Button>
          )}
        </TabsContent>
      </Tabs>

      {/* Transaction intelligence drawer */}
      <Sheet open={selectedTxn !== null} onOpenChange={(o) => { if (!o) setSelectedTxn(null); }}>
        <SheetContent className="sm:max-w-md w-full overflow-y-auto">
          {selectedTxn && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-sm">{selectedTxn.id}</SheetTitle>
                <SheetDescription>Transaction intelligence</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <Detail label="Amount" value={formatNGN(selectedTxn.amount)} mono />
                  <Detail label="Channel" value={selectedTxn.channel} />
                  <Detail label="Status" value={selectedTxn.status} />
                  <Detail label="Merchant" value={selectedTxn.merchantName} />
                  <Detail label="When" value={format(new Date(selectedTxn.timestamp), 'PPpp')} />
                </div>

                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                    <Smartphone className="h-3 w-3" /> Device & network intelligence
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Detail label="Device ID" value={selectedTxn.deviceId} mono />
                    <Detail label="IP address" value={reveal ? selectedTxn.ipAddress : maskMid(selectedTxn.ipAddress, 3, 2)} mono />
                    <Detail label="City" value={selectedTxn.geoCity} />
                    <Detail label="Country" value={selectedTxn.geoCountry} />
                    <Detail label="Trust score" value={(selectedTxn.trustScore * 100).toFixed(0) + '%'} mono />
                    {derived.devices.find(d => d.id === selectedTxn.deviceId) ? (
                      <Detail label="Device status" value="Trusted (on file)" />
                    ) : (
                      <Detail label="Device status" value="New device" />
                    )}
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                    <Wallet className="h-3 w-3" /> Linked-account intelligence
                  </h4>
                  {derived.linkedAccounts.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">No linked accounts on file.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {derived.linkedAccounts.slice(0, 3).map((a, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] border border-border rounded-md px-2 py-1.5" data-testid={`drawer-linked-${i}`}>
                          <div className="min-w-0">
                            <p className="font-mono truncate">{reveal ? a.account : maskMid(a.account, 3, 3)}</p>
                            <p className="text-muted-foreground truncate">{a.bank} · {a.relation}</p>
                          </div>
                          <Badge variant="outline" className={cn('text-[9px] capitalize ml-2', RISK_META[a.risk])}>{a.risk}</Badge>
                        </div>
                      ))}
                      {derived.linkedAccounts.length > 3 && (
                        <p className="text-[10px] text-muted-foreground">+ {derived.linkedAccounts.length - 3} more — see Relationships tab</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-semibold mb-2">Risk & detection</h4>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Risk score</span>
                      <span className="font-mono">{selectedTxn.riskScore}</span>
                    </div>
                    <Progress
                      value={selectedTxn.riskScore}
                      className={cn(
                        'h-1.5',
                        selectedTxn.riskScore >= 75 ? '[&>div]:bg-red-500' :
                          selectedTxn.riskScore >= 50 ? '[&>div]:bg-orange-500' :
                            selectedTxn.riskScore >= 25 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500',
                      )}
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">ML probability</span>
                      <span className="font-mono">{(selectedTxn.mlScore * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Anomaly score</span>
                      <span className="font-mono">{selectedTxn.anomalyScore.toFixed(2)}</span>
                    </div>
                    {selectedTxn.rulesTriggered.length > 0 && (
                      <div>
                        <p className="text-muted-foreground mb-1">Rules triggered:</p>
                        <div className="flex flex-wrap gap-1">
                          {selectedTxn.rulesTriggered.map(r => (
                            <Badge key={r} variant="outline" className="text-[10px]">{r}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className={cn('text-xs mt-0.5', mono && 'font-mono')}>{value}</p>
    </div>
  );
}
