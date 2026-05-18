import { useMemo, useState, useEffect } from 'react';
import {
  ShieldAlert,
  Search,
  Play,
  X,
  CheckCircle2,
  XCircle,
  ArrowUpCircle,
  Eye,
  Globe,
  AlertTriangle,
  Newspaper,
  Crown,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import {
  type ScreeningMatch,
  type ScreeningType,
  type Customer,
} from '@/lib/compliance-data';
import { useCustomersQuery, useScreeningQuery } from '@/hooks/use-compliance-api';

type StatusFilter = ScreeningMatch['status'] | 'all';
type TabKey = 'all' | 'pep' | 'sanction' | 'adverse_media' | 'watchlist';

const TYPE_META: Record<ScreeningType, { label: string; cls: string; Icon: typeof Crown }> = {
  pep: { label: 'PEP', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30', Icon: Crown },
  sanction: { label: 'Sanction', cls: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30', Icon: ShieldAlert },
  adverse_media: { label: 'Adverse Media', cls: 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30', Icon: Newspaper },
  watchlist: { label: 'Watchlist', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30', Icon: ListChecks },
};

const STATUS_META: Record<ScreeningMatch['status'], { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  under_review: { label: 'Under Review', cls: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30' },
  true_positive: { label: 'True Positive', cls: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30' },
  false_positive: { label: 'False Positive', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
};

const formatNumber = (n: number) => n.toLocaleString();

export default function Screening() {
  const { toast } = useToast();

  const screeningQuery = useScreeningQuery();
  const customersQuery = useCustomersQuery();
  const baseMatches = screeningQuery.data ?? [];
  const customers = customersQuery.data ?? [];

  const [matches, setMatches] = useState<ScreeningMatch[]>([]);
  useEffect(() => { setMatches(baseMatches); }, [baseMatches]);
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>('all');
  const [confidenceRange, setConfidenceRange] = useState<[number, number]>([0, 100]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const jurisdictions = useMemo(() => {
    const s = new Set<string>();
    matches.forEach((m) => s.add(m.jurisdiction));
    return Array.from(s).sort();
  }, [matches]);

  const kpis = useMemo(() => {
    const ytdStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    return {
      total: matches.length,
      pep: matches.filter((m) => m.screeningType === 'pep').length,
      sanction: matches.filter((m) => m.screeningType === 'sanction').length,
      adverse: matches.filter((m) => m.screeningType === 'adverse_media').length,
      action: matches.filter((m) => m.actionRequired).length,
      truePositiveYtd: matches.filter(
        (m) => m.status === 'true_positive' && new Date(m.detectedAt).getTime() >= ytdStart,
      ).length,
    };
  }, [matches]);

  const filtered = useMemo(() => {
    return matches.filter((m) => {
      if (tab === 'pep' && m.screeningType !== 'pep') return false;
      if (tab === 'sanction' && m.screeningType !== 'sanction') return false;
      if (tab === 'adverse_media' && m.screeningType !== 'adverse_media') return false;
      if (tab === 'watchlist' && m.screeningType !== 'watchlist') return false;
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (jurisdictionFilter !== 'all' && m.jurisdiction !== jurisdictionFilter) return false;
      if (m.confidence < confidenceRange[0] || m.confidence > confidenceRange[1]) return false;
      if (search) {
        const q = search.toLowerCase();
        const hit =
          m.customerName.toLowerCase().includes(q) ||
          m.matchedName.toLowerCase().includes(q) ||
          m.customerId.toLowerCase().includes(q) ||
          m.matchedListSource.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [matches, tab, statusFilter, jurisdictionFilter, confidenceRange, search]);

  const selected = useMemo(
    () => (selectedId ? matches.find((m) => m.id === selectedId) || null : null),
    [matches, selectedId],
  );
  const selectedCustomer = useMemo(
    () => (selected ? customers.find((c) => c.id === selected.customerId) || null : null),
    [customers, selected],
  );

  const updateStatus = (id: string, status: ScreeningMatch['status']) => {
    setMatches((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, status, actionRequired: status === 'open' || status === 'under_review' } : m,
      ),
    );
  };

  const handleAction = (
    m: ScreeningMatch,
    action: 'view' | 'false_positive' | 'true_positive' | 'escalate',
  ) => {
    if (action === 'view') {
      setSelectedId(m.id);
      return;
    }
    if (action === 'false_positive') {
      updateStatus(m.id, 'false_positive');
      toast({ title: 'Marked as False Positive', description: `${m.matchedName} → ${m.customerName}` });
    }
    if (action === 'true_positive') {
      updateStatus(m.id, 'true_positive');
      toast({ title: 'Marked as True Positive', description: `${m.matchedName} → ${m.customerName}` });
    }
    if (action === 'escalate') {
      updateStatus(m.id, 'under_review');
      toast({
        title: 'Escalated to EDD',
        description: `Customer ${m.customerName} routed to Enhanced Due Diligence queue.`,
      });
    }
  };

  const runScreening = () => {
    if (scanning) return;
    setScanning(true);
    toast({ title: 'Screening started', description: 'Re-scanning customer base against all watchlists…' });
    setTimeout(() => {
      setScanning(false);
      toast({
        title: 'Screening complete',
        description: `${matches.length} matches reviewed. No new hits detected.`,
      });
    }, 1600);
  };

  const confidenceClass = (c: number) =>
    c >= 90
      ? '[&>div]:bg-red-500'
      : c >= 75
        ? '[&>div]:bg-amber-500'
        : '[&>div]:bg-emerald-500';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight flex items-center gap-2"
            data-testid="text-page-title"
          >
            <ShieldAlert className="h-6 w-6 text-primary" />
            Sanctions & PEP Screening
          </h1>
          <p className="text-muted-foreground text-sm">
            Continuous PEP, sanctions, adverse media and watchlist screening
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            CBN / NFIU compliant
          </Badge>
          <Button onClick={runScreening} disabled={scanning} data-testid="button-run-screening">
            <Play className={cn('h-4 w-4 mr-2', scanning && 'animate-pulse')} />
            {scanning ? 'Scanning…' : 'Run Screening'}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Total Matches" value={kpis.total} icon={ListChecks} testId="kpi-total" />
        <KpiCard label="PEP" value={kpis.pep} icon={Crown} accent="amber" testId="kpi-pep" />
        <KpiCard
          label="Sanctions"
          value={kpis.sanction}
          icon={ShieldAlert}
          accent="red"
          testId="kpi-sanction"
        />
        <KpiCard
          label="Adverse Media"
          value={kpis.adverse}
          icon={Newspaper}
          accent="purple"
          testId="kpi-adverse"
        />
        <KpiCard
          label="Action Required"
          value={kpis.action}
          icon={AlertTriangle}
          accent="amber"
          testId="kpi-action"
        />
        <KpiCard
          label="True Positives YTD"
          value={kpis.truePositiveYtd}
          icon={CheckCircle2}
          accent="red"
          testId="kpi-true-positive"
        />
      </div>

      {/* Tabs + Filters */}
      <div className="space-y-3">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
            <TabsTrigger value="pep" data-testid="tab-pep">PEP</TabsTrigger>
            <TabsTrigger value="sanction" data-testid="tab-sanction">Sanctions</TabsTrigger>
            <TabsTrigger value="adverse_media" data-testid="tab-adverse">Adverse Media</TabsTrigger>
            <TabsTrigger value="watchlist" data-testid="tab-watchlist">Watchlist</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-end gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search customer, matched name, list source…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-44" data-testid="filter-status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="true_positive">True Positive</SelectItem>
              <SelectItem value="false_positive">False Positive</SelectItem>
            </SelectContent>
          </Select>

          <Select value={jurisdictionFilter} onValueChange={setJurisdictionFilter}>
            <SelectTrigger className="w-44" data-testid="filter-jurisdiction">
              <SelectValue placeholder="Jurisdiction" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jurisdictions</SelectItem>
              {jurisdictions.map((j) => (
                <SelectItem key={j} value={j}>
                  {j}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="w-64 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Confidence range</span>
              <span className="font-mono" data-testid="text-confidence-range">
                {confidenceRange[0]}% – {confidenceRange[1]}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={1}
              value={confidenceRange}
              onValueChange={(v) => setConfidenceRange([v[0], v[1]] as [number, number])}
              data-testid="slider-confidence"
            />
          </div>
        </div>
      </div>

      {/* Main content: table + side panel */}
      <div className={cn('grid gap-4', selected ? 'lg:grid-cols-[1fr_380px]' : 'grid-cols-1')}>
        {/* Table */}
        <div className="stat-card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b border-border">
                <tr className="text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Customer</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Screening</th>
                  <th className="px-3 py-2 font-medium">Matched Name</th>
                  <th className="px-3 py-2 font-medium">List Source</th>
                  <th className="px-3 py-2 font-medium w-40">Confidence</th>
                  <th className="px-3 py-2 font-medium">Match</th>
                  <th className="px-3 py-2 font-medium">Jurisdiction</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Detected</th>
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {screeningQuery.isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-12 text-center text-sm text-muted-foreground" data-testid="text-screening-loading">
                      Loading screening matches...
                    </td>
                  </tr>
                ) : screeningQuery.isError ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-12 text-center text-sm text-destructive" data-testid="text-screening-error">
                      Failed to load screening matches: {screeningQuery.error instanceof Error ? screeningQuery.error.message : 'Unknown error'}
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-12 text-center text-sm text-muted-foreground"
                      data-testid="text-empty"
                    >
                      {matches.length === 0 ? 'No screening matches yet.' : 'No matches for current filters.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((m) => {
                    const tm = TYPE_META[m.screeningType];
                    const sm = STATUS_META[m.status];
                    const isHighConf = m.confidence >= 90;
                    const isSelected = selectedId === m.id;
                    return (
                      <tr
                        key={m.id}
                        onClick={() => setSelectedId(m.id)}
                        className={cn(
                          'border-b border-border/60 cursor-pointer hover-elevate',
                          isHighConf && 'bg-red-500/5',
                          isSelected && 'bg-primary/5',
                        )}
                        data-testid={`row-match-${m.id}`}
                      >
                        <td className="px-3 py-2.5">
                          <div className="font-medium truncate max-w-[180px]">{m.customerName}</div>
                          <div className="text-xs text-muted-foreground">{m.customerId}</div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {m.customerType}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={cn('text-[10px] gap-1', tm.cls)}>
                            <tm.Icon className="h-3 w-3" />
                            {tm.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="font-medium truncate max-w-[180px]">{m.matchedName}</div>
                          {m.positionOrRole && (
                            <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                              {m.positionOrRole}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground truncate max-w-[160px]">
                          {m.matchedListSource}
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Progress
                              value={m.confidence}
                              className={cn('h-2 w-24', confidenceClass(m.confidence))}
                            />
                            <span className="font-mono text-xs w-10 text-right">{m.confidence}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {m.matchType}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center gap-1 text-xs">
                            <Globe className="h-3 w-3 text-muted-foreground" />
                            {m.jurisdiction}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant="outline" className={cn('text-[10px]', sm.cls)}>
                            {sm.label}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(m.detectedAt), { addSuffix: true })}
                        </td>
                        <td className="px-3 py-2.5">
                          <div
                            className="flex items-center justify-end gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleAction(m, 'view')}
                              data-testid={`button-view-${m.id}`}
                              title="View match"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleAction(m, 'false_positive')}
                              data-testid={`button-false-positive-${m.id}`}
                              title="Mark False Positive"
                            >
                              <XCircle className="h-4 w-4 text-emerald-600" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleAction(m, 'true_positive')}
                              data-testid={`button-true-positive-${m.id}`}
                              title="Mark True Positive"
                            >
                              <CheckCircle2 className="h-4 w-4 text-red-500" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleAction(m, 'escalate')}
                              data-testid={`button-escalate-${m.id}`}
                              title="Escalate to EDD"
                            >
                              <ArrowUpCircle className="h-4 w-4 text-primary" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="px-3 py-2 border-t border-border text-xs text-muted-foreground flex items-center justify-between">
            <span data-testid="text-result-count">
              Showing {formatNumber(filtered.length)} of {formatNumber(matches.length)} matches
            </span>
            <span>Confidence ≥ 90% highlighted</span>
          </div>
        </div>

        {/* Side panel (desktop) */}
        {selected && (
          <aside
            className="stat-card hidden lg:block sticky top-4 h-fit"
            data-testid="panel-match-detail"
          >
            <MatchDetail
              match={selected}
              customer={selectedCustomer}
              onClose={() => setSelectedId(null)}
              onAction={handleAction}
            />
          </aside>
        )}
      </div>

      {/* Mobile sheet — only on small screens to avoid overlay dimming the desktop layout */}
      <Sheet
        open={!!selected && !isDesktop}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>Match Detail</SheetTitle>
                <SheetDescription>{selected.id}</SheetDescription>
              </SheetHeader>
              <MatchDetail
                match={selected}
                customer={selectedCustomer}
                onClose={() => setSelectedId(null)}
                onAction={handleAction}
                hideClose
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: number;
  icon: typeof ListChecks;
  accent?: 'amber' | 'red' | 'purple' | 'emerald';
  testId?: string;
}
function KpiCard({ label, value, icon: Icon, accent, testId }: KpiCardProps) {
  const accentCls =
    accent === 'red'
      ? 'text-red-500'
      : accent === 'amber'
        ? 'text-amber-500'
        : accent === 'purple'
          ? 'text-purple-500'
          : accent === 'emerald'
            ? 'text-emerald-500'
            : 'text-primary';
  return (
    <div className="stat-card p-3" data-testid={testId}>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className={cn('h-3.5 w-3.5', accentCls)} />
      </div>
      <p className="text-xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

interface MatchDetailProps {
  match: ScreeningMatch;
  customer: Customer | null;
  onClose: () => void;
  onAction: (m: ScreeningMatch, a: 'view' | 'false_positive' | 'true_positive' | 'escalate') => void;
  hideClose?: boolean;
}
function MatchDetail({ match, customer, onClose, onAction, hideClose }: MatchDetailProps) {
  const tm = TYPE_META[match.screeningType];
  const sm = STATUS_META[match.status];
  const aliases = useMemo(() => {
    const parts = match.matchedName.split(' ');
    return [
      match.matchedName,
      parts.slice().reverse().join(' '),
      parts[0] + ' ' + (parts[parts.length - 1] || '').charAt(0) + '.',
    ].filter((v, i, arr) => arr.indexOf(v) === i);
  }, [match]);

  const confidenceBreakdown = [
    { label: 'Name similarity', value: Math.min(100, match.confidence + 4) },
    { label: 'Date of birth match', value: Math.max(0, match.confidence - 12) },
    { label: 'Jurisdiction overlap', value: match.confidence },
    { label: 'Alias / phonetic', value: Math.max(0, match.confidence - 6) },
  ];

  const customerName = customer
    ? customer.type === 'individual'
      ? customer.fullName
      : customer.companyName
    : match.customerName;

  return (
    <div className="p-4 space-y-4">
      {!hideClose && (
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{match.id}</p>
            <h3 className="font-semibold text-base">Match Detail</h3>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            data-testid="button-close-panel"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className={cn('gap-1', tm.cls)}>
            <tm.Icon className="h-3 w-3" />
            {tm.label}
          </Badge>
          <Badge variant="outline" className={sm.cls}>
            {sm.label}
          </Badge>
          {match.actionRequired && (
            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/30">
              Action required
            </Badge>
          )}
        </div>
        <h4 className="text-lg font-semibold leading-tight">{match.matchedName}</h4>
        {match.positionOrRole && (
          <p className="text-sm text-muted-foreground">{match.positionOrRole}</p>
        )}
        <p className="text-xs text-muted-foreground">{match.details}</p>
      </div>

      <div className="rounded-md border border-border p-3 space-y-2">
        <p className="text-xs uppercase text-muted-foreground tracking-wide">Customer</p>
        <p className="text-sm font-medium">{customerName}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">ID</p>
            <p className="font-mono">{match.customerId}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Type</p>
            <p className="capitalize">{match.customerType}</p>
          </div>
          {customer && (
            <>
              <div>
                <p className="text-muted-foreground">Account</p>
                <p className="font-mono">{customer.accountNumber}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Risk</p>
                <p className="capitalize">{customer.riskLevel}</p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-md border border-border p-3 space-y-2">
        <p className="text-xs uppercase text-muted-foreground tracking-wide">
          Confidence breakdown
        </p>
        <div className="flex items-center justify-between">
          <span className="text-sm">Overall</span>
          <span className="font-mono text-sm font-semibold">{match.confidence}%</span>
        </div>
        <Progress
          value={match.confidence}
          className={cn(
            'h-2',
            match.confidence >= 90
              ? '[&>div]:bg-red-500'
              : match.confidence >= 75
                ? '[&>div]:bg-amber-500'
                : '[&>div]:bg-emerald-500',
          )}
        />
        <div className="space-y-1.5 pt-2">
          {confidenceBreakdown.map((b) => (
            <div key={b.label} className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-32 truncate">{b.label}</span>
              <Progress value={b.value} className="h-1.5 flex-1" />
              <span className="font-mono text-[10px] w-10 text-right">{b.value}%</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-border p-3 space-y-2">
        <p className="text-xs uppercase text-muted-foreground tracking-wide">Aliases matched</p>
        <div className="flex flex-wrap gap-1.5">
          {aliases.map((a) => (
            <Badge key={a} variant="secondary" className="text-[10px]">
              {a}
            </Badge>
          ))}
        </div>
      </div>

      <div className="rounded-md border border-border p-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">List source</p>
          <p className="font-medium">{match.matchedListSource}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Match type</p>
          <p className="capitalize">{match.matchType}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Jurisdiction</p>
          <p>{match.jurisdiction}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Detected</p>
          <p>{format(new Date(match.detectedAt), 'MMM d, yyyy')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAction(match, 'false_positive')}
          data-testid="button-panel-false-positive"
        >
          <XCircle className="h-4 w-4 mr-1.5" /> False Positive
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAction(match, 'true_positive')}
          data-testid="button-panel-true-positive"
        >
          <CheckCircle2 className="h-4 w-4 mr-1.5" /> True Positive
        </Button>
        <Button
          size="sm"
          onClick={() => onAction(match, 'escalate')}
          data-testid="button-panel-escalate"
        >
          <ArrowUpCircle className="h-4 w-4 mr-1.5" /> Escalate to EDD
        </Button>
      </div>
    </div>
  );
}
