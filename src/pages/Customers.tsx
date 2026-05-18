import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users as UsersIcon, Search, Filter, Save, X, Download, ShieldAlert,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight,
  Crown, AlertTriangle, FileWarning, Trash2, Eye, EyeOff,
  Building2, UserCircle2, RefreshCw, Briefcase, Globe2, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import {
  getCustomers, getScreeningMatches, computeRiskScore, getCustomerDerivations,
  type Customer,
} from '@/lib/compliance-data';
import { useQuery } from '@tanstack/react-query';
import {
  recordCustomerAction, useAllCustomerRecords, ACTION_LABELS, CURRENT_ACTOR,
  type ScreeningStatus,
} from '@/lib/customer-actions';

interface CustomerAggregateRow {
  customerId: string;
  openCases: number;
  openAlerts: number;
  txnCount: number;
  avgTicket: number;
  lastActivityMs: number | null;
  crossBorder: boolean;
}

type SectionFilter = 'all' | 'individual' | 'corporate' | 'high-risk' | 'pep' | 'watchlisted';
type SortKey = 'name' | 'type' | 'risk' | 'kyc' | 'volume' | 'monthly' | 'avgTicket' | 'reviewed' | 'cases' | 'alerts' | 'lastActivity' | 'screening' | 'channel';
type SortDir = 'asc' | 'desc';
type DateRange = 'all' | '7d' | '30d' | '90d' | '1y';

interface SavedFilter {
  name: string;
  search: string;
  type: string;
  risk: string;
  kyc: string;
  edd: string;
  flag: string;
  channel: string;
  onboardedRange: DateRange;
  screening: string;
}

const SAVED_FILTERS_KEY = 'snapfort.customers.savedFilters';
const PAGE_SIZE = 20;

const customerName = (c: Customer) => (c.type === 'individual' ? c.fullName : c.companyName);
const formatNGN = (n: number) =>
  '₦' + (n >= 1_000_000 ? (n / 1_000_000).toFixed(1) + 'M' : n.toLocaleString());

const KYC_META: Record<string, string> = {
  verified: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  failed: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  rejected: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
  expired: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30',
};

const RISK_META: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30',
  high: 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30',
};

const RANGE_DAYS: Record<DateRange, number | null> = { all: null, '7d': 7, '30d': 30, '90d': 90, '1y': 365 };

export default function Customers() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const baseCustomers = useMemo(() => getCustomers(), []);
  const screening = useMemo(() => getScreeningMatches(), []);
  const { data: aggregatesData } = useQuery<CustomerAggregateRow[]>({
    queryKey: ['/api/customers/aggregates'],
  });
  const aggregatesByCustomer = useMemo(() => {
    const m = new Map<string, CustomerAggregateRow>();
    (aggregatesData ?? []).forEach(a => m.set(a.customerId, a));
    return m;
  }, [aggregatesData]);

  const persistedRecords = useAllCustomerRecords();

  const watchlistedIds = useMemo(() => {
    const s = new Set<string>();
    screening.forEach(m => {
      if (m.screeningType === 'watchlist' || m.screeningType === 'sanction') s.add(m.customerId);
    });
    baseCustomers.forEach(c => { if (c.sanctionFlag) s.add(c.id); });
    Object.entries(persistedRecords).forEach(([cid, rec]) => {
      if (rec.state.watchlisted) s.add(cid);
    });
    return s;
  }, [screening, baseCustomers, persistedRecords]);

  const persistedTagged = useMemo(() => {
    const m: Record<string, boolean> = {};
    Object.entries(persistedRecords).forEach(([cid, rec]) => {
      if (rec.state.taggedHighRisk) m[cid] = true;
    });
    return m;
  }, [persistedRecords]);

  const persistedScreening = useMemo(() => {
    const m: Record<string, { status: ScreeningStatus; ts: number }> = {};
    Object.entries(persistedRecords).forEach(([cid, rec]) => {
      if (rec.state.lastScreeningStatus) {
        m[cid] = { status: rec.state.lastScreeningStatus, ts: rec.state.lastScreeningAt ?? 0 };
      }
    });
    return m;
  }, [persistedRecords]);

  const persistedRiskAdj = useMemo(() => {
    const m: Record<string, number> = {};
    Object.entries(persistedRecords).forEach(([cid, rec]) => {
      if (rec.state.riskAdjustment) m[cid] = rec.state.riskAdjustment;
    });
    return m;
  }, [persistedRecords]);

  type ScreeningCategory = 'cleared' | 'pep' | 'sanction' | 'watchlist' | 'adverse_media';
  const screeningStatusByCustomer = useMemo(() => {
    const m = new Map<string, ScreeningCategory>();
    baseCustomers.forEach(c => m.set(c.id, 'cleared'));
    const order: Record<ScreeningCategory, number> = {
      sanction: 4, pep: 3, watchlist: 2, adverse_media: 1, cleared: 0,
    };
    screening.forEach(s => {
      if (s.status === 'false_positive') return;
      const cat: ScreeningCategory = s.screeningType === 'sanction' ? 'sanction'
        : s.screeningType === 'pep' ? 'pep'
        : s.screeningType === 'watchlist' ? 'watchlist'
        : 'adverse_media';
      const cur = m.get(s.customerId) ?? 'cleared';
      if (order[cat] > order[cur]) m.set(s.customerId, cat);
    });
    return m;
  }, [baseCustomers, screening]);

  const opsByCustomer = useMemo(() => {
    const map = new Map<string, {
      openCases: number; openAlerts: number; lastActivity: number; analyst: string;
      monthlyVolume: number; avgTicket: number; crossBorder: boolean;
    }>();
    baseCustomers.forEach(c => {
      const agg = aggregatesByCustomer.get(c.id);
      const lastActivity = agg?.lastActivityMs ?? new Date(c.lastReviewedAt).getTime();
      const analyst = getCustomerDerivations(c).primaryAnalyst;
      const monthlyVolume = c.expectedMonthlyVolume;
      const fallbackAvg = Math.round(c.totalVolume / Math.max(1, c.totalTransactions || 1));
      const avgTicket = agg && agg.txnCount > 0 ? Math.round(agg.avgTicket) : fallbackAvg;
      map.set(c.id, {
        openCases: agg?.openCases ?? 0,
        openAlerts: agg?.openAlerts ?? 0,
        lastActivity,
        analyst,
        monthlyVolume,
        avgTicket,
        crossBorder: agg?.crossBorder ?? false,
      });
    });
    return map;
  }, [baseCustomers, aggregatesByCustomer]);

  const [tagged, setTagged] = useState<Record<string, boolean>>({});
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  // Debounce search 300ms
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [kycFilter, setKycFilter] = useState<string>('all');
  const [eddFilter, setEddFilter] = useState<string>('all');
  const [flagFilter, setFlagFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [onboardedRange, setOnboardedRange] = useState<DateRange>('all');
  const [screeningFilter, setScreeningFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('risk');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reveal, setReveal] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [bulkScreening, setBulkScreening] = useState<Record<string, { status: 'cleared' | 'pep' | 'sanction' | 'watchlist' | 'adverse_media'; ts: number }>>({});

  const section = (searchParams.get('filter') as SectionFilter) || 'all';

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_FILTERS_KEY);
      if (raw) setSavedFilters(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [section, search, typeFilter, riskFilter, kycFilter, eddFilter, flagFilter, channelFilter, onboardedRange, screeningFilter]);

  const enriched = useMemo(() => {
    return baseCustomers.map(c => {
      const r = computeRiskScore(c);
      const ops = opsByCustomer.get(c.id)!;
      const persistedAdj = persistedRiskAdj[c.id] ?? 0;
      const rec = persistedRecords[c.id]?.state ?? {};
      return {
        c,
        riskScore: Math.max(0, Math.min(100, r.score + persistedAdj)),
        watchlisted: watchlistedIds.has(c.id),
        tagged: !!tagged[c.id] || !!persistedTagged[c.id],
        eddRequested: !!rec.eddRequested,
        blocked: !!rec.blocked,
        openCases: ops.openCases,
        openAlerts: ops.openAlerts,
        lastActivity: ops.lastActivity,
        analyst: ops.analyst,
        monthlyVolume: ops.monthlyVolume,
        avgTicket: ops.avgTicket,
        crossBorder: ops.crossBorder,
        screeningStatus: bulkScreening[c.id]?.status ?? persistedScreening[c.id]?.status ?? (screeningStatusByCustomer.get(c.id) || 'cleared'),
        primaryChannel: c.type === 'individual'
          ? (Object.entries(c.channelUsage).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mobile')
          : 'web',
      };
    });
  }, [baseCustomers, watchlistedIds, tagged, persistedTagged, persistedRiskAdj, persistedScreening, persistedRecords, opsByCustomer, screeningStatusByCustomer, bulkScreening]);

  const filtered = useMemo(() => {
    const cutoff = (() => {
      const d = RANGE_DAYS[onboardedRange];
      return d ? Date.now() - d * 86400000 : null;
    })();
    return enriched.filter(({ c, riskScore, watchlisted, screeningStatus, primaryChannel, eddRequested, blocked }) => {
      if (section === 'individual' && c.type !== 'individual') return false;
      if (section === 'corporate' && c.type !== 'business') return false;
      if (section === 'high-risk' && riskScore < 60 && c.riskLevel !== 'high') return false;
      if (section === 'pep' && !c.pepFlag) return false;
      if (section === 'watchlisted' && !watchlisted) return false;

      if (typeFilter !== 'all' && c.type !== typeFilter) return false;
      if (riskFilter !== 'all' && c.riskLevel !== riskFilter) return false;
      if (kycFilter !== 'all' && c.kycStatus !== kycFilter) return false;
      if (eddFilter !== 'all' && c.eddStatus !== eddFilter) return false;
      if (flagFilter === 'pep' && !c.pepFlag) return false;
      if (flagFilter === 'sanction' && !c.sanctionFlag) return false;
      if (flagFilter === 'fraud' && !c.fraudRiskFlag) return false;
      if (flagFilter === 'watchlisted' && !watchlisted) return false;
      if (flagFilter === 'edd_requested' && !eddRequested) return false;
      if (flagFilter === 'blocked' && !blocked) return false;
      if (channelFilter !== 'all' && primaryChannel !== channelFilter) return false;
      if (screeningFilter !== 'all' && screeningStatus !== screeningFilter) return false;
      if (cutoff !== null && new Date(c.onboardedAt).getTime() < cutoff) return false;

      if (search) {
        const q = search.toLowerCase();
        const hits = [
          c.id,
          customerName(c),
          c.accountNumber,
          c.type === 'individual' ? c.bvn : c.cacNumber,
          c.type === 'individual' ? (c.nin || '') : c.tin,
          c.type === 'individual' ? c.email : c.contactEmail,
          c.type === 'individual' ? c.phone : c.contactPhone,
        ].some(v => (v || '').toLowerCase().includes(q));
        if (!hits) return false;
      }
      return true;
    });
  }, [enriched, section, typeFilter, riskFilter, kycFilter, eddFilter, flagFilter, channelFilter, screeningFilter, onboardedRange, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'name': return customerName(a.c).localeCompare(customerName(b.c)) * dir;
        case 'type': return a.c.type.localeCompare(b.c.type) * dir;
        case 'risk': return (a.riskScore - b.riskScore) * dir;
        case 'kyc': return a.c.kycStatus.localeCompare(b.c.kycStatus) * dir;
        case 'volume': return (a.c.totalVolume - b.c.totalVolume) * dir;
        case 'monthly': return (a.monthlyVolume - b.monthlyVolume) * dir;
        case 'avgTicket': return (a.avgTicket - b.avgTicket) * dir;
        case 'reviewed': return (new Date(a.c.lastReviewedAt).getTime() - new Date(b.c.lastReviewedAt).getTime()) * dir;
        case 'cases': return (a.openCases - b.openCases) * dir;
        case 'alerts': return (a.openAlerts - b.openAlerts) * dir;
        case 'lastActivity': return (a.lastActivity - b.lastActivity) * dir;
        case 'screening': return a.screeningStatus.localeCompare(b.screeningStatus) * dir;
        case 'channel': return a.primaryChannel.localeCompare(b.primaryChannel) * dir;
      }
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageItems = useMemo(
    () => sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sorted, page],
  );

  const kpis = useMemo(() => {
    const total = baseCustomers.length;
    const high = enriched.filter(e => e.riskScore >= 60).length;
    const pep = baseCustomers.filter(c => c.pepFlag).length;
    const sanc = baseCustomers.filter(c => c.sanctionFlag).length;
    const watch = enriched.filter(e => e.watchlisted).length;
    const withOpenCases = enriched.filter(e => e.openCases > 0).length;
    return { total, high, pep, sanc, watch, withOpenCases };
  }, [baseCustomers, enriched]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'risk' || key === 'volume' || key === 'monthly' || key === 'avgTicket' || key === 'cases' || key === 'alerts' || key === 'lastActivity' ? 'desc' : 'asc');
    }
  };

  const allOnPageSelected = pageItems.length > 0 && pageItems.every(p => selectedIds.has(p.c.id));
  const togglePageAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allOnPageSelected) pageItems.forEach(p => next.delete(p.c.id));
      else pageItems.forEach(p => next.add(p.c.id));
      return next;
    });
  };

  const persistFilters = (next: SavedFilter[]) => {
    setSavedFilters(next);
    try { localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const handleSaveFilter = () => {
    const name = savedName.trim();
    if (!name) return;
    const next = [
      ...savedFilters.filter(f => f.name !== name),
      { name, search, type: typeFilter, risk: riskFilter, kyc: kycFilter, edd: eddFilter, flag: flagFilter, channel: channelFilter, onboardedRange, screening: screeningFilter },
    ];
    persistFilters(next);
    setSaveOpen(false);
    setSavedName('');
    toast({ title: 'Filter saved', description: `"${name}" added to saved filters.` });
  };

  const applySavedFilter = (f: SavedFilter) => {
    setSearchInput(f.search); setSearch(f.search);
    setTypeFilter(f.type);
    setRiskFilter(f.risk);
    setKycFilter(f.kyc);
    setEddFilter(f.edd);
    setFlagFilter(f.flag);
    setChannelFilter(f.channel ?? 'all');
    setOnboardedRange(f.onboardedRange ?? 'all');
    setScreeningFilter(f.screening ?? 'all');
    toast({ title: 'Filter applied', description: f.name });
  };

  const removeSavedFilter = (name: string) => {
    persistFilters(savedFilters.filter(f => f.name !== name));
  };

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setTypeFilter('all'); setRiskFilter('all');
    setKycFilter('all'); setEddFilter('all'); setFlagFilter('all');
    setChannelFilter('all'); setOnboardedRange('all'); setScreeningFilter('all');
  };

  const exportCsv = (ids: string[]) => {
    const list = enriched.filter(e => ids.includes(e.c.id));
    const headers = ['ID', 'Name', 'Type', 'KYC', 'Risk Level', 'Risk Score', 'Account', 'Total Volume', 'Monthly Volume', 'Avg Ticket', 'Channel', 'Cross-Border', 'Screening', 'Open Cases', 'Open Alerts', 'Last Activity', 'Analyst', 'PEP', 'Sanction', 'EDD'];
    const rows = list.map(({ c, riskScore, openCases, openAlerts, lastActivity, analyst, monthlyVolume, avgTicket, primaryChannel, crossBorder, screeningStatus }) => [
      c.id, customerName(c), c.type, c.kycStatus, c.riskLevel, String(riskScore),
      c.accountNumber, String(c.totalVolume), String(monthlyVolume), String(avgTicket),
      primaryChannel, crossBorder ? 'Y' : 'N', screeningStatus,
      String(openCases), String(openAlerts),
      new Date(lastActivity).toISOString(), analyst,
      c.pepFlag ? 'Y' : 'N', c.sanctionFlag ? 'Y' : 'N', c.eddStatus,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Exported', description: `${list.length} customer(s) exported.` });
  };

  const bulkAction = (action: 'edd' | 'tag' | 'export' | 'screening' | 'recalc') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (action === 'edd') {
      ids.forEach(id => recordCustomerAction(
        id,
        { actor: CURRENT_ACTOR, action: 'send_edd', label: ACTION_LABELS.send_edd, note: 'Routed to EDD queue via bulk action.' },
        { eddRequested: true },
      ));
      toast({ title: 'Sent for EDD', description: `${ids.length} customer(s) routed to EDD queue.` });
    } else if (action === 'tag') {
      setTagged(prev => { const n = { ...prev }; ids.forEach(i => { n[i] = true; }); return n; });
      ids.forEach(id => recordCustomerAction(
        id,
        { actor: CURRENT_ACTOR, action: 'tag_high_risk', label: ACTION_LABELS.tag_high_risk, note: 'Flagged for enhanced review via bulk action.' },
        { taggedHighRisk: true },
      ));
      toast({ title: 'Tagged as High Risk', description: `${ids.length} customer(s) flagged for review.` });
    } else if (action === 'screening') {
      const ts = Date.now();
      setBulkScreening(prev => {
        const n = { ...prev };
        ids.forEach((id, i) => {
          const seed = (id.charCodeAt(id.length - 1) + i) % 10;
          const status: ScreeningStatus =
            seed >= 8 ? 'pep' : seed === 7 ? 'watchlist' : seed === 6 ? 'adverse_media' : 'cleared';
          n[id] = { status, ts };
          recordCustomerAction(
            id,
            {
              actor: CURRENT_ACTOR,
              action: 'rescreen_bulk',
              label: ACTION_LABELS.rescreen_bulk,
              note: `Re-screened against PEP/sanctions/watchlists — status: ${status.replace('_', ' ')}.`,
              ts,
            },
            { lastScreeningStatus: status, lastScreeningAt: ts },
          );
        });
        return n;
      });
      toast({ title: 'Re-screening complete', description: `${ids.length} customer(s) re-screened against PEP/sanctions/watchlists. Status column updated.` });
    } else if (action === 'recalc') {
      ids.forEach((id, i) => {
        const seed = (id.charCodeAt(id.length - 1) + i + Date.now()) % 11;
        const delta = seed - 5;
        const cumulative = (persistedRiskAdj[id] ?? 0) + delta;
        recordCustomerAction(
          id,
          {
            actor: CURRENT_ACTOR,
            action: 'recalc_risk',
            label: ACTION_LABELS.recalc_risk,
            note: `Bulk risk recalculation applied (${delta >= 0 ? '+' : ''}${delta}).`,
          },
          { riskAdjustment: cumulative },
        );
      });
      toast({ title: 'Risk recalculated', description: `Risk scores refreshed for ${ids.length} customer(s).` });
    } else if (action === 'export') {
      exportCsv(ids);
    }
    if (action !== 'recalc') setSelectedIds(new Set());
  };

  const setSection = (s: SectionFilter) => {
    if (s === 'all') setSearchParams({}, { replace: true });
    else setSearchParams({ filter: s }, { replace: true });
  };

  const SortHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => {
    const Icon = sortKey !== k ? ArrowUpDown : sortDir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th
        scope="col"
        aria-sort={sortKey === k ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={cn('px-3 py-2 font-medium text-xs uppercase text-muted-foreground select-none', className)}
      >
        <button
          type="button"
          onClick={() => toggleSort(k)}
          className="inline-flex items-center gap-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
          data-testid={`sort-${k}`}
        >
          {label}<Icon className="h-3 w-3" />
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="customers-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <UsersIcon className="h-6 w-6 text-primary" />
            Customer Intelligence
          </h1>
          <p className="text-muted-foreground text-sm">
            360° view of customers, risk, and compliance posture
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setReveal(r => !r)} data-testid="button-toggle-mask">
            {reveal ? <EyeOff className="h-4 w-4 mr-1.5" /> : <Eye className="h-4 w-4 mr-1.5" />}
            {reveal ? 'Hide' : 'Reveal'} IDs
          </Button>
          <Button size="sm" onClick={() => exportCsv(sorted.map(s => s.c.id))} data-testid="button-export-all">
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={UsersIcon} label="Total" value={kpis.total} testId="kpi-total" />
        <Kpi icon={AlertTriangle} accent="red" label="High Risk" value={kpis.high} testId="kpi-high" />
        <Kpi icon={Crown} accent="amber" label="PEP" value={kpis.pep} testId="kpi-pep" />
        <Kpi icon={ShieldAlert} accent="red" label="Sanctioned" value={kpis.sanc} testId="kpi-sanc" />
        <Kpi icon={ShieldCheck} accent="emerald" label="Watchlisted" value={kpis.watch} testId="kpi-watch" />
        <Kpi icon={Briefcase} accent="orange" label="Open Cases" value={kpis.withOpenCases} testId="kpi-open-cases" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {([
          ['all', 'All'], ['individual', 'Individual'], ['corporate', 'Corporate'],
          ['high-risk', 'High-Risk'], ['pep', 'PEP'], ['watchlisted', 'Watchlisted'],
        ] as [SectionFilter, string][]).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setSection(k)}
            className={cn(
              'px-3 py-1 rounded-full text-xs border transition-all',
              section === k
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-muted',
            )}
            data-testid={`pill-section-${k}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="stat-card p-4 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search name, ID, account, BVN/CAC, email…"
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              data-testid="input-search"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32" data-testid="filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="individual">Individual</SelectItem>
              <SelectItem value="business">Corporate</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-28" data-testid="filter-risk"><SelectValue placeholder="Risk" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risk</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
            </SelectContent>
          </Select>
          <Select value={kycFilter} onValueChange={setKycFilter}>
            <SelectTrigger className="w-32" data-testid="filter-kyc"><SelectValue placeholder="KYC" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All KYC</SelectItem>
              <SelectItem value="verified">Verified</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eddFilter} onValueChange={setEddFilter}>
            <SelectTrigger className="w-32" data-testid="filter-edd"><SelectValue placeholder="EDD" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All EDD</SelectItem>
              <SelectItem value="not_required">Not required</SelectItem>
              <SelectItem value="required">Required</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
          <Select value={flagFilter} onValueChange={setFlagFilter}>
            <SelectTrigger className="w-32" data-testid="filter-flag"><SelectValue placeholder="Flag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All flags</SelectItem>
              <SelectItem value="pep">PEP</SelectItem>
              <SelectItem value="sanction">Sanctioned</SelectItem>
              <SelectItem value="fraud">Fraud signal</SelectItem>
              <SelectItem value="watchlisted">Watchlisted</SelectItem>
              <SelectItem value="edd_requested">EDD requested</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-32" data-testid="filter-channel"><SelectValue placeholder="Channel" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="web">Web</SelectItem>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="atm">ATM</SelectItem>
              <SelectItem value="branch">Branch</SelectItem>
            </SelectContent>
          </Select>
          <Select value={screeningFilter} onValueChange={setScreeningFilter}>
            <SelectTrigger className="w-32" data-testid="filter-screening"><SelectValue placeholder="Screening" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All screening</SelectItem>
              <SelectItem value="cleared">Cleared</SelectItem>
              <SelectItem value="pep">PEP</SelectItem>
              <SelectItem value="sanction">Sanction</SelectItem>
              <SelectItem value="watchlist">Watchlist</SelectItem>
              <SelectItem value="adverse_media">Adverse media</SelectItem>
            </SelectContent>
          </Select>
          <Select value={onboardedRange} onValueChange={(v) => setOnboardedRange(v as DateRange)}>
            <SelectTrigger className="w-36" data-testid="filter-onboarded"><SelectValue placeholder="Onboarded" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Onboarded: any</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setSaveOpen(true)} data-testid="button-save-filter">
            <Save className="h-4 w-4 mr-1.5" />
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-clear-filter">
            <X className="h-4 w-4 mr-1.5" />
            Clear
          </Button>
        </div>

        {savedFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              <Filter className="h-3 w-3" /> Saved:
            </span>
            {savedFilters.map(f => (
              <span
                key={f.name}
                role="button"
                tabIndex={0}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted hover-elevate cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => applySavedFilter(f)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applySavedFilter(f); } }}
                data-testid={`saved-filter-${f.name}`}
              >
                {f.name}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeSavedFilter(f.name); }}
                  className="text-muted-foreground hover:text-destructive"
                  data-testid={`button-remove-saved-${f.name}`}
                  aria-label={`Remove saved filter ${f.name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div
          className="stat-card flex items-center justify-between gap-3 flex-wrap p-3 border-primary/30"
          data-testid="bulk-action-bar"
        >
          <span className="text-sm font-medium">
            {selectedIds.size} customer(s) selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => bulkAction('screening')} data-testid="button-bulk-screening">
              <ShieldAlert className="h-4 w-4 mr-1.5" />Run Screening
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkAction('recalc')} data-testid="button-bulk-recalc">
              <RefreshCw className="h-4 w-4 mr-1.5" />Recalculate Risk
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkAction('edd')} data-testid="button-bulk-edd">
              <FileWarning className="h-4 w-4 mr-1.5" />Send for EDD
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulkAction('tag')} data-testid="button-bulk-tag">
              <AlertTriangle className="h-4 w-4 mr-1.5" />Tag High-Risk
            </Button>
            <Button size="sm" onClick={() => bulkAction('export')} data-testid="button-bulk-export">
              <Download className="h-4 w-4 mr-1.5" />Export CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} data-testid="button-bulk-clear">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="stat-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr className="text-left">
                <th className="px-3 py-2 w-10">
                  <Checkbox
                    checked={allOnPageSelected}
                    onCheckedChange={togglePageAll}
                    data-testid="checkbox-select-page"
                  />
                </th>
                <SortHead k="name" label="Customer" />
                <SortHead k="type" label="Type" />
                <th className="px-3 py-2 font-medium text-xs uppercase text-muted-foreground">Account / IDs</th>
                <SortHead k="kyc" label="KYC" />
                <SortHead k="risk" label="Risk" />
                <th className="px-3 py-2 font-medium text-xs uppercase text-muted-foreground">Flags</th>
                <SortHead k="screening" label="Screening" />
                <SortHead k="channel" label="Channel" />
                <SortHead k="cases" label="Cases" />
                <SortHead k="alerts" label="Alerts" />
                <SortHead k="volume" label="Total Vol" />
                <SortHead k="monthly" label="Monthly" />
                <SortHead k="avgTicket" label="Avg Ticket" />
                <SortHead k="lastActivity" label="Last Activity" />
                <th className="px-3 py-2 font-medium text-xs uppercase text-muted-foreground">Analyst</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={16} className="px-3 py-12 text-center text-sm text-muted-foreground" data-testid="text-empty">
                    No customers match the current filters.
                  </td>
                </tr>
              ) : pageItems.map(({ c, riskScore, watchlisted, tagged: isTagged, eddRequested, blocked, openCases, openAlerts, lastActivity, analyst, monthlyVolume, avgTicket, primaryChannel, crossBorder, screeningStatus }) => {
                const checked = selectedIds.has(c.id);
                const idLine = c.type === 'individual'
                  ? `BVN ${reveal ? c.bvn : (c.bvn.slice(0, 3) + '••••' + c.bvn.slice(-2))}`
                  : `CAC ${reveal ? c.cacNumber : (c.cacNumber.slice(0, 2) + '••••' + c.cacNumber.slice(-2))}`;
                return (
                  <tr
                    key={c.id}
                    role="link"
                    tabIndex={0}
                    aria-label={`Open ${customerName(c)} profile`}
                    className={cn(
                      'border-b border-border/60 cursor-pointer hover-elevate focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      checked && 'bg-primary/5',
                      isTagged && 'border-l-2 border-l-red-500',
                    )}
                    onClick={() => navigate(`/customers/${c.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/customers/${c.id}`);
                      }
                    }}
                    data-testid={`row-customer-${c.id}`}
                  >
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            if (v) next.add(c.id); else next.delete(c.id);
                            return next;
                          });
                        }}
                        data-testid={`checkbox-row-${c.id}`}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-7 w-7 rounded-md bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0">
                          {c.type === 'individual'
                            ? <UserCircle2 className="h-4 w-4" />
                            : <Building2 className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" data-testid={`text-name-${c.id}`}>
                            {customerName(c)}
                          </p>
                          <p className="text-[11px] text-muted-foreground font-mono">{c.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {c.type === 'individual' ? 'Individual' : 'Corporate'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-xs font-mono">{reveal ? c.accountNumber : (c.accountNumber.slice(0, 3) + '••••' + c.accountNumber.slice(-3))}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{idLine}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={cn('text-[10px] capitalize', KYC_META[c.kycStatus])}>
                        {c.kycStatus}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={riskScore}
                          className={cn('h-1.5 w-16',
                            riskScore >= 75 ? '[&>div]:bg-red-500' :
                              riskScore >= 50 ? '[&>div]:bg-orange-500' :
                                riskScore >= 25 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500')}
                        />
                        <span className="font-mono text-xs w-7 text-right">{riskScore}</span>
                        <Badge variant="outline" className={cn('text-[10px] capitalize', RISK_META[c.riskLevel])}>
                          {c.riskLevel}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {c.pepFlag && <Badge variant="outline" className="text-[9px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">PEP</Badge>}
                        {c.sanctionFlag && <Badge variant="outline" className="text-[9px] bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">SANC</Badge>}
                        {watchlisted && !c.sanctionFlag && <Badge variant="outline" className="text-[9px] bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30">WATCH</Badge>}
                        {c.fraudRiskFlag && <Badge variant="outline" className="text-[9px] bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30">FRAUD</Badge>}
                        {eddRequested && <Badge variant="outline" className="text-[9px] bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30" data-testid={`badge-edd-${c.id}`}>EDD</Badge>}
                        {blocked && <Badge variant="outline" className="text-[9px] bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30" data-testid={`badge-blocked-${c.id}`}>BLOCKED</Badge>}
                        {!c.pepFlag && !c.sanctionFlag && !watchlisted && !c.fraudRiskFlag && !eddRequested && !blocked && <span className="text-[10px] text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className={cn('text-[10px] capitalize',
                        screeningStatus === 'sanction' ? 'bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30'
                          : screeningStatus === 'pep' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                          : screeningStatus === 'watchlist' ? 'bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30'
                          : screeningStatus === 'adverse_media' ? 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30'
                            : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30')}>
                        {screeningStatus.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="inline-flex items-center gap-1 text-xs capitalize">
                        {primaryChannel}
                        {crossBorder && <Globe2 className="h-3 w-3 text-amber-500" aria-label="Cross-border activity" />}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs">{openCases}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{openAlerts}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{formatNGN(c.totalVolume)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{formatNGN(monthlyVolume)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{formatNGN(avgTicket)}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(lastActivity), { addSuffix: true })}
                    </td>
                    <td className="px-3 py-2.5 text-xs">{analyst}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{pageItems.length}</span> of <span className="font-medium text-foreground">{sorted.length}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} data-testid="button-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono">{page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} data-testid="button-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save current filters</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="e.g. PEP – pending review"
            value={savedName}
            onChange={(e) => setSavedName(e.target.value)}
            data-testid="input-saved-name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)} data-testid="button-cancel-save">Cancel</Button>
            <Button onClick={handleSaveFilter} disabled={!savedName.trim()} data-testid="button-confirm-save">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface KpiProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  sub?: string;
  accent?: 'emerald' | 'red' | 'amber' | 'orange';
  testId?: string;
}
function Kpi({ icon: Icon, label, value, sub, accent, testId }: KpiProps) {
  const tone = accent === 'emerald' ? 'text-emerald-500'
    : accent === 'red' ? 'text-red-500'
      : accent === 'amber' ? 'text-amber-500'
        : accent === 'orange' ? 'text-orange-500'
          : 'text-primary';
  return (
    <div className="stat-card p-3 hover-elevate" data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Icon className={cn('h-4 w-4', tone)} />
      </div>
      <p className="text-xl font-bold mt-1 font-mono">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}
