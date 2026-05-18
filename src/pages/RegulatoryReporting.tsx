import { useEffect, useMemo, useState } from 'react';
import {
  FileText, Search, AlertTriangle, ClipboardCheck, ChevronRight,
  Send, Pencil, Download, FileCode2, ShieldCheck, Clock, Inbox,
  Sparkles, Loader2,
} from 'lucide-react';
import { analyzeWithAI } from '@/lib/ai';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getCustomers,
  type RegulatoryReport,
  type ReportStatus,
  type ReportType,
} from '@/lib/compliance-data';
import { Label } from '@/components/ui/label';
import { useRegulatoryReportsQuery, useCreateReport, usePatchReport } from '@/hooks/use-regulatory-fraud-api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';
import { apiRequest } from '@/lib/queryClient';

interface ReportArtifact {
  id: string;
  reportId: string;
  kind: 'PDF' | 'XML';
  version: number;
  storageKey: string;
  storageBackend: string;
  sizeBytes: number;
  mime: string;
  createdAt: string;
  createdBy: string;
}

const formatNaira = (n: number) =>
  '₦' + n.toLocaleString('en-NG', { maximumFractionDigits: 0 });

const statusBadge = (status: ReportStatus) => {
  switch (status) {
    case 'draft':
      return 'bg-muted text-muted-foreground border-border';
    case 'pending_review':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'submitted':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'acknowledged':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'rejected':
      return 'bg-red-500/10 text-red-600 border-red-500/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

const formatStatus = (s: ReportStatus) =>
  s.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());

interface DeadlineInfo {
  text: string;
  isOverdue: boolean;
  isUrgent: boolean;
  hoursLeft: number;
}

function getDeadlineInfo(deadline: string): DeadlineInfo {
  const now = Date.now();
  const dl = new Date(deadline).getTime();
  const diffMs = dl - now;
  const hoursLeft = diffMs / (1000 * 60 * 60);
  if (diffMs < 0) {
    return {
      text: `Overdue ${formatDistanceToNow(new Date(deadline))}`,
      isOverdue: true,
      isUrgent: true,
      hoursLeft,
    };
  }
  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return {
    text: `${h}h ${m}m ${s}s left`,
    isOverdue: false,
    isUrgent: hoursLeft < 6,
    hoursLeft,
  };
}

const KpiCard = ({
  label,
  value,
  hint,
  accent,
  icon: Icon,
  testId,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'default' | 'warning' | 'danger' | 'success' | 'info';
  icon: React.ElementType;
  testId: string;
}) => {
  const accentMap = {
    default: 'text-foreground',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    success: 'text-emerald-600',
    info: 'text-blue-600',
  } as const;
  return (
    <div className="stat-card p-4" data-testid={testId}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={cn('text-xl font-bold mt-1', accentMap[accent ?? 'default'])}>{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
        </div>
        <div className="h-8 w-8 rounded-md bg-muted/40 flex items-center justify-center flex-shrink-0">
          <Icon className={cn('h-4 w-4', accentMap[accent ?? 'default'])} />
        </div>
      </div>
    </div>
  );
};

export default function RegulatoryReporting() {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canFileReports = can('file_reports');

  // Tick to refresh deadline countdowns
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const reportsQuery = useRegulatoryReportsQuery();
  const reports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);
  const patchReport = usePatchReport();
  const createReport = useCreateReport();

  const [tab, setTab] = useState<ReportType>('STR');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [amountRange, setAmountRange] = useState<string>('all');

  const [selectedReport, setSelectedReport] = useState<RegulatoryReport | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState<RegulatoryReport | null>(null);
  const [narrativeEditOpen, setNarrativeEditOpen] = useState(false);
  const [narrativeDraft, setNarrativeDraft] = useState('');
  const [aiNarrativeLoading, setAiNarrativeLoading] = useState(false);

  const handleAiDraftNarrative = async (r: RegulatoryReport) => {
    setAiNarrativeLoading(true);
    try {
      const result = await analyzeWithAI('str_draft', {
        report: {
          id: r.id,
          type: r.type,
          customerName: r.customerName,
          customerId: r.customerId,
          customerType: r.customerType,
          amount: r.amount,
          currency: r.currency,
          reason: r.reason,
          transactionIds: r.transactionIds,
          flagsTriggered: r.flagsTriggered,
          jurisdiction: r.jurisdiction,
          createdAt: r.createdAt,
          deadline: r.deadline,
          existingNarrative: r.narrative,
        },
      });
      const aiNarrative = (result || r.narrative).trim();
      const newId = `${r.type}-AI-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const created = await createReport.mutateAsync({
        id: newId,
        type: r.type,
        customerId: r.customerId,
        customerName: r.customerName,
        customerType: r.customerType,
        amount: r.amount,
        currency: r.currency,
        transactionIds: r.transactionIds,
        reason: r.reason,
        narrative: aiNarrative,
        status: 'draft',
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        preparedBy: 'AI Assistant',
        attachments: 0,
        flagsTriggered: r.flagsTriggered,
        jurisdiction: r.jurisdiction,
      });
      setSelectedReport(created);
      toast({
        title: 'AI draft created',
        description: `New draft ${created.id} saved. Review before submitting.`,
      });
    } catch (err) {
      toast({
        title: 'AI draft failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setAiNarrativeLoading(false);
    }
  };

  const strReports = useMemo(() => reports.filter((r) => r.type === 'STR'), [reports]);
  const ctrReports = useMemo(() => reports.filter((r) => r.type === 'CTR'), [reports]);

  const kpis = useMemo(() => {
    const now = Date.now();
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const submitted = strReports.filter((r) => r.status === 'submitted' || r.status === 'acknowledged');
    const submittedOnTime = submitted.filter((r) => {
      if (!r.submittedAt) return false;
      const created = new Date(r.createdAt).getTime();
      const sub = new Date(r.submittedAt).getTime();
      return sub - created <= 24 * 60 * 60 * 1000;
    });
    const compliancePct = submitted.length === 0
      ? 100
      : Math.round((submittedOnTime.length / submitted.length) * 100);
    const pending = strReports.filter((r) => r.status === 'pending_review' || r.status === 'draft').length;
    const overdue = strReports.filter((r) => {
      const dl = new Date(r.deadline).getTime();
      const isFinal = r.status === 'submitted' || r.status === 'acknowledged';
      return dl < now && !isFinal;
    }).length;
    const ctrFlags = ctrReports.length;
    const reportsThisMonth = reports.filter((r) => new Date(r.createdAt).getTime() >= monthStart).length;
    const ack = strReports.filter((r) => r.status === 'acknowledged').length
      + ctrReports.filter((r) => r.status === 'acknowledged').length;

    return { compliancePct, submittedCount: submitted.length, pending, overdue, ctrFlags, reportsThisMonth, ack };
  }, [reports, strReports, ctrReports]);

  const approachingDeadline = useMemo(() => {
    const now = Date.now();
    return strReports.filter((r) => {
      const dl = new Date(r.deadline).getTime();
      const isFinal = r.status === 'submitted' || r.status === 'acknowledged';
      return !isFinal && dl - now > 0 && dl - now < 6 * 60 * 60 * 1000;
    }).length;
  }, [strReports]);

  const activeList = tab === 'STR' ? strReports : ctrReports;

  const filteredReports = useMemo(() => {
    return activeList.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const inText =
          r.id.toLowerCase().includes(q) ||
          r.customerName.toLowerCase().includes(q) ||
          r.customerId.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q);
        if (!inText) return false;
      }
      if (dateRange !== 'all') {
        const days = parseInt(dateRange, 10);
        const cutoff = Date.now() - days * 86400000;
        if (new Date(r.createdAt).getTime() < cutoff) return false;
      }
      if (amountRange !== 'all') {
        if (amountRange === 'lt1m' && r.amount >= 1_000_000) return false;
        if (amountRange === '1m-10m' && (r.amount < 1_000_000 || r.amount > 10_000_000)) return false;
        if (amountRange === '10m-100m' && (r.amount < 10_000_000 || r.amount > 100_000_000)) return false;
        if (amountRange === 'gt100m' && r.amount < 100_000_000) return false;
      }
      return true;
    });
  }, [activeList, statusFilter, searchQuery, dateRange, amountRange]);

  const handleRowClick = (r: RegulatoryReport) => {
    setSelectedReport(r);
    setNarrativeDraft(r.narrative);
  };

  const handleSubmitReport = async (r: RegulatoryReport) => {
    const submittedAt = new Date().toISOString();
    const regulatoryRef = r.regulatoryRef ?? `NFIU-${Math.floor(Math.random() * 900000 + 100000)}`;
    try {
      const updated = await patchReport.mutateAsync({
        id: r.id,
        patch: { status: 'submitted', submittedAt, submittedBy: 'Current User', regulatoryRef },
      });
      // Render and persist a PDF snapshot of the as-submitted report so the
      // exact regulator-facing document is archived alongside the status
      // change. Best-effort: a render failure must not roll back the submit.
      let artifactNote = '';
      try {
        const art = await apiRequest<ReportArtifact>(
          'POST',
          `/api/regulatory-reports/${r.id}/artifacts`,
          { kind: 'PDF' },
        );
        qc.invalidateQueries({ queryKey: ['/api/regulatory-reports', r.id, 'artifacts'] });
        artifactNote = ` · PDF v${art.version} archived to OBS`;
      } catch (err) {
        console.warn('[submit] artifact generation failed:', err);
        artifactNote = ' · PDF archive failed (open report to retry)';
      }
      if (selectedReport?.id === r.id) setSelectedReport(updated);
      setConfirmSubmit(null);
      toast({ title: 'Report submitted to NFIU', description: `${r.id} submitted successfully${artifactNote}` });
    } catch (err) {
      toast({
        title: 'Submit failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const handleSaveNarrative = async () => {
    if (!selectedReport) return;
    try {
      const updated = await patchReport.mutateAsync({
        id: selectedReport.id,
        patch: { narrative: narrativeDraft },
      });
      setSelectedReport(updated);
      setNarrativeEditOpen(false);
      toast({ title: 'Narrative updated', description: 'Saved to database.' });
    } catch (err) {
      toast({
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const [newDraftOpen, setNewDraftOpen] = useState(false);

  const handleCreateDraft = async (payload: {
    type: ReportType;
    customerId: string;
    customerName: string;
    customerType: 'individual' | 'business';
    amount: number;
    reason: string;
    narrative: string;
    transactionIds: string[];
    flagsTriggered: string[];
  }) => {
    try {
      const id = `${payload.type}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
      const created = await createReport.mutateAsync({
        id,
        type: payload.type,
        customerId: payload.customerId,
        customerName: payload.customerName,
        customerType: payload.customerType,
        amount: payload.amount,
        currency: 'NGN',
        transactionIds: payload.transactionIds,
        reason: payload.reason,
        narrative: payload.narrative,
        status: 'draft',
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        preparedBy: 'Current User',
        attachments: 0,
        flagsTriggered: payload.flagsTriggered,
        jurisdiction: 'NG',
      });
      setNewDraftOpen(false);
      toast({ title: 'Draft created', description: `${created.id} saved as draft.` });
    } catch (err) {
      toast({
        title: 'Create failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
      throw err;
    }
  };

  const escapeXml = (s: string) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');

  // Note: XML/PDF rendering moved to the server (`server/report-render.ts`).
  // Client only POSTs the report id + kind; bytes are produced and uploaded
  // to OBS in one round-trip and a presigned download URL is returned.

  const qc = useQueryClient();
  const artifactsQuery = useQuery<ReportArtifact[]>({
    queryKey: ['/api/regulatory-reports', selectedReport?.id, 'artifacts'],
    enabled: !!selectedReport?.id,
  });

  const triggerDownload = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const generateAndDownload = async (r: RegulatoryReport, kind: 'PDF' | 'XML') => {
    try {
      toast({ title: `Generating ${kind}…`, description: `${r.id} is being rendered server-side.` });
      const res = await apiRequest<ReportArtifact & { downloadUrl: string }>(
        'POST',
        `/api/regulatory-reports/${r.id}/artifacts`,
        { kind },
      );
      qc.invalidateQueries({ queryKey: ['/api/regulatory-reports', r.id, 'artifacts'] });
      triggerDownload(res.downloadUrl, `${r.id}-v${res.version}.${kind === 'PDF' ? 'pdf' : 'xml'}`);
      toast({
        title: `${kind} ready`,
        description: `${r.id} v${res.version} saved to Object Storage and downloaded.`,
      });
    } catch (err) {
      toast({
        title: `${kind} export failed`,
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const downloadArtifact = async (a: ReportArtifact) => {
    try {
      const res = await apiRequest<{ url: string }>('GET', `/api/report-artifacts/${a.id}/download`);
      triggerDownload(res.url, `${a.reportId}-v${a.version}.${a.kind === 'PDF' ? 'pdf' : 'xml'}`);
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };

  const exportXml = (r: RegulatoryReport) => generateAndDownload(r, 'XML');

  const exportPdf = (r: RegulatoryReport) => generateAndDownload(r, 'PDF');

  const exportById = (kind: 'PDF' | 'XML', id: string) => {
    const r = reports.find(x => x.id === id);
    if (!r) return;
    if (kind === 'XML') exportXml(r); else exportPdf(r);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Sticky banner */}
      {approachingDeadline > 0 && (
        <div
          className="sticky top-0 z-50 rounded-md border border-red-500/30 bg-red-500/10 text-red-600 px-4 py-2 flex items-center gap-2 text-sm font-medium"
          data-testid="banner-deadline-warning"
        >
          <AlertTriangle className="h-4 w-4" />
          {approachingDeadline} report{approachingDeadline > 1 ? 's' : ''} approaching 24h NFIU deadline
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold tracking-tight flex items-center gap-2"
            data-testid="text-page-title"
          >
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Regulatory Reporting
          </h1>
          <p className="text-muted-foreground text-sm">
            Suspicious Transaction Reports (STR) & Currency Transaction Reports (CTR) for NFIU/CBN
          </p>
        </div>
        <Button onClick={() => setNewDraftOpen(true)} data-testid="button-new-draft">
          <FileText className="h-4 w-4 mr-2" /> New {tab} Draft
        </Button>
      </div>

      <NewReportDraftDialog
        open={newDraftOpen}
        onOpenChange={setNewDraftOpen}
        defaultType={tab}
        onCreate={handleCreateDraft}
        loading={createReport.isPending}
      />

      {reportsQuery.isLoading && (
        <div className="text-sm text-muted-foreground" data-testid="text-loading">Loading reports…</div>
      )}
      {reportsQuery.isError && (
        <div className="text-sm text-red-600" data-testid="text-error">
          Failed to load reports: {(reportsQuery.error as Error).message}
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="STR Submitted"
          value={kpis.submittedCount}
          hint={`${kpis.compliancePct}% within 24h`}
          accent="info"
          icon={Send}
          testId="kpi-str-submitted"
        />
        <KpiCard
          label="STR Pending"
          value={kpis.pending}
          accent="warning"
          icon={Clock}
          testId="kpi-str-pending"
        />
        <KpiCard
          label="STR Overdue"
          value={kpis.overdue}
          accent="danger"
          icon={AlertTriangle}
          testId="kpi-str-overdue"
        />
        <KpiCard
          label="CTR Flags"
          value={kpis.ctrFlags}
          accent="info"
          icon={FileText}
          testId="kpi-ctr-flags"
        />
        <KpiCard
          label="Reports This Month"
          value={kpis.reportsThisMonth}
          accent="default"
          icon={ClipboardCheck}
          testId="kpi-reports-month"
        />
        <KpiCard
          label="NFIU Acknowledgments"
          value={kpis.ack}
          accent="success"
          icon={ShieldCheck}
          testId="kpi-nfiu-ack"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportType)}>
        <TabsList data-testid="tabs-report-type">
          <TabsTrigger value="STR" data-testid="tab-str">
            STR Reports ({strReports.length})
          </TabsTrigger>
          <TabsTrigger value="CTR" data-testid="tab-ctr">
            CTR Reports ({ctrReports.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by ID, customer, reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-reports"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[170px]" data-testid="filter-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[150px]" data-testid="filter-date">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Dates</SelectItem>
                <SelectItem value="1">Last 24h</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={amountRange} onValueChange={setAmountRange}>
              <SelectTrigger className="w-[170px]" data-testid="filter-amount">
                <SelectValue placeholder="Amount Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Amounts</SelectItem>
                <SelectItem value="lt1m">{'< ₦1M'}</SelectItem>
                <SelectItem value="1m-10m">₦1M – ₦10M</SelectItem>
                <SelectItem value="10m-100m">₦10M – ₦100M</SelectItem>
                <SelectItem value="gt100m">{'> ₦100M'}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="stat-card">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Report ID</th>
                    <th>Type</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Reason</th>
                    <th>Flags</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Deadline</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReports.map((r) => {
                    const dl = getDeadlineInfo(r.deadline);
                    const isFinal = r.status === 'submitted' || r.status === 'acknowledged';
                    return (
                      <tr
                        key={r.id}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-muted/40',
                          selectedReport?.id === r.id && 'bg-primary/10',
                        )}
                        onClick={() => handleRowClick(r)}
                        data-testid={`row-report-${r.id}`}
                      >
                        <td className="font-mono text-xs">{r.id}</td>
                        <td>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px]',
                              r.type === 'STR'
                                ? 'border-amber-500/30 text-amber-600'
                                : 'border-blue-500/30 text-blue-600',
                            )}
                          >
                            {r.type}
                          </Badge>
                        </td>
                        <td>
                          <div className="text-sm font-medium truncate max-w-[160px]">
                            {r.customerName}
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {r.customerId}
                          </div>
                        </td>
                        <td className="font-mono text-sm">{formatNaira(r.amount)}</td>
                        <td className="max-w-[200px]">
                          <p className="text-xs truncate">{r.reason}</p>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1 max-w-[140px]">
                            {r.flagsTriggered.slice(0, 3).map((f) => (
                              <Badge
                                key={f}
                                variant="outline"
                                className="text-[9px] px-1.5 py-0 border-border"
                              >
                                {f}
                              </Badge>
                            ))}
                            {r.flagsTriggered.length > 3 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{r.flagsTriggered.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <Badge variant="outline" className={cn('text-[10px]', statusBadge(r.status))}>
                            {formatStatus(r.status)}
                          </Badge>
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {format(new Date(r.createdAt), 'MMM d, HH:mm')}
                        </td>
                        <td>
                          {isFinal ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <span
                              className={cn(
                                'text-xs font-mono',
                                dl.isOverdue
                                  ? 'text-red-600 font-bold'
                                  : dl.isUrgent
                                    ? 'text-red-500'
                                    : 'text-muted-foreground',
                              )}
                              data-testid={`deadline-${r.id}`}
                            >
                              {dl.text}
                            </span>
                          )}
                        </td>
                        <td className="text-xs text-muted-foreground">
                          {r.submittedAt ? format(new Date(r.submittedAt), 'MMM d, HH:mm') : '—'}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleRowClick(r)}
                              title="View Details"
                              data-testid={`button-view-${r.id}`}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                            {!isFinal && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setSelectedReport(r);
                                  setNarrativeDraft(r.narrative);
                                  setNarrativeEditOpen(true);
                                }}
                                title="Edit Draft"
                                data-testid={`button-edit-${r.id}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {!isFinal && canFileReports && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setConfirmSubmit(r)}
                                title="Submit"
                                data-testid={`button-submit-${r.id}`}
                              >
                                <Send className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => exportPdf(r)}
                              title="Export PDF"
                              data-testid={`button-pdf-${r.id}`}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => exportXml(r)}
                              title="Export XML"
                              data-testid={`button-xml-${r.id}`}
                            >
                              <FileCode2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                        <td>
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {filteredReports.length === 0 && (
              <div className="text-center py-12">
                <Inbox className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No {tab} reports found matching your criteria</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      <Sheet
        open={!!selectedReport && !narrativeEditOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedReport(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto"
          data-testid="sheet-report-detail"
        >
          {selectedReport && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{selectedReport.id}</span>
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[10px]',
                      selectedReport.type === 'STR'
                        ? 'border-amber-500/30 text-amber-600'
                        : 'border-blue-500/30 text-blue-600',
                    )}
                  >
                    {selectedReport.type}
                  </Badge>
                  <Badge variant="outline" className={cn('text-[10px]', statusBadge(selectedReport.status))}>
                    {formatStatus(selectedReport.status)}
                  </Badge>
                </SheetTitle>
                <SheetDescription>
                  {selectedReport.type === 'STR' ? 'Suspicious Transaction Report' : 'Currency Transaction Report'}{' '}
                  · NFIU jurisdiction: {selectedReport.jurisdiction}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                {/* Customer */}
                <section>
                  <h4 className="text-sm font-semibold mb-2">Customer</h4>
                  <div className="rounded-md border border-border p-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name</span>
                      <span>{selectedReport.customerName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Customer ID</span>
                      <span className="font-mono text-xs">{selectedReport.customerId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type</span>
                      <span className="capitalize">{selectedReport.customerType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-mono">{formatNaira(selectedReport.amount)} {selectedReport.currency}</span>
                    </div>
                  </div>
                </section>

                {/* Transactions */}
                <section>
                  <h4 className="text-sm font-semibold mb-2">Transactions ({selectedReport.transactionIds.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedReport.transactionIds.map((tx) => (
                      <Badge key={tx} variant="outline" className="font-mono text-[10px]">
                        {tx}
                      </Badge>
                    ))}
                  </div>
                </section>

                {/* Narrative */}
                <section>
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold">Narrative</h4>
                    {!(selectedReport.status === 'submitted' || selectedReport.status === 'acknowledged') && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAiDraftNarrative(selectedReport)}
                          disabled={aiNarrativeLoading}
                          data-testid="button-ai-draft-narrative"
                        >
                          {aiNarrativeLoading ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="h-4 w-4 mr-1" />
                          )}
                          AI-Draft Narrative
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setNarrativeDraft(selectedReport.narrative);
                            setNarrativeEditOpen(true);
                          }}
                          data-testid="button-edit-narrative"
                        >
                          <Pencil className="h-4 w-4 mr-1" /> Edit Narrative
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="rounded-md border border-border p-3 max-h-48 overflow-y-auto text-sm leading-relaxed text-muted-foreground">
                    {selectedReport.narrative}
                  </div>
                </section>

                {/* Flags & attachments */}
                <section className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Flags Triggered</h4>
                    <div className="flex flex-wrap gap-1">
                      {selectedReport.flagsTriggered.map((f) => (
                        <Badge key={f} variant="outline" className="text-[10px]">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Attachments</h4>
                    <p className="text-sm">{selectedReport.attachments} file(s)</p>
                  </div>
                </section>

                {/* Approval chain */}
                <section>
                  <h4 className="text-sm font-semibold mb-2">Approval Chain</h4>
                  <div className="rounded-md border border-border divide-y divide-border text-sm">
                    <div className="flex justify-between p-2">
                      <span className="text-muted-foreground">Prepared by</span>
                      <span>{selectedReport.preparedBy}</span>
                    </div>
                    <div className="flex justify-between p-2">
                      <span className="text-muted-foreground">Reviewed by</span>
                      <span>{selectedReport.reviewedBy ?? '—'}</span>
                    </div>
                    <div className="flex justify-between p-2">
                      <span className="text-muted-foreground">Submitted by</span>
                      <span>{selectedReport.submittedBy ?? '—'}</span>
                    </div>
                  </div>
                </section>

                {/* Timestamps */}
                <section>
                  <h4 className="text-sm font-semibold mb-2">Timestamps</h4>
                  <div className="rounded-md border border-border divide-y divide-border text-sm">
                    <div className="flex justify-between p-2">
                      <span className="text-muted-foreground">Created</span>
                      <span>{format(new Date(selectedReport.createdAt), 'PPpp')}</span>
                    </div>
                    <div className="flex justify-between p-2">
                      <span className="text-muted-foreground">Deadline</span>
                      <span>{format(new Date(selectedReport.deadline), 'PPpp')}</span>
                    </div>
                    {selectedReport.submittedAt && (
                      <div className="flex justify-between p-2">
                        <span className="text-muted-foreground">Submitted</span>
                        <span>{format(new Date(selectedReport.submittedAt), 'PPpp')}</span>
                      </div>
                    )}
                    {selectedReport.acknowledgedAt && (
                      <div className="flex justify-between p-2">
                        <span className="text-muted-foreground">Acknowledged</span>
                        <span>{format(new Date(selectedReport.acknowledgedAt), 'PPpp')}</span>
                      </div>
                    )}
                    {selectedReport.regulatoryRef && (
                      <div className="flex justify-between p-2">
                        <span className="text-muted-foreground">Regulatory Ref</span>
                        <span className="font-mono text-xs">{selectedReport.regulatoryRef}</span>
                      </div>
                    )}
                  </div>
                </section>

                {/* Action toolbar */}
                <section className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                  {!(selectedReport.status === 'submitted' || selectedReport.status === 'acknowledged') && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setNarrativeDraft(selectedReport.narrative);
                          setNarrativeEditOpen(true);
                        }}
                        data-testid="button-detail-edit-narrative"
                      >
                        <Pencil className="h-4 w-4 mr-2" /> Edit Narrative
                      </Button>
                      {canFileReports && (
                        <Button
                          onClick={() => setConfirmSubmit(selectedReport)}
                          data-testid="button-detail-submit"
                        >
                          <Send className="h-4 w-4 mr-2" /> Submit to NFIU
                        </Button>
                      )}
                    </>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => exportXml(selectedReport)}
                    data-testid="button-detail-xml"
                  >
                    <FileCode2 className="h-4 w-4 mr-2" /> Download XML
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => exportPdf(selectedReport)}
                    data-testid="button-detail-pdf"
                  >
                    <Download className="h-4 w-4 mr-2" /> Generate PDF
                  </Button>
                </section>

                <section className="space-y-2">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    <FileCode2 className="h-4 w-4 text-primary" />
                    Saved Artifacts (Object Storage)
                  </h3>
                  {artifactsQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">Loading…</p>
                  ) : !artifactsQuery.data?.length ? (
                    <p className="text-xs text-muted-foreground">
                      No saved artifacts yet. Use Generate PDF / Download XML above to render & store one.
                    </p>
                  ) : (
                    <div className="border border-border rounded-md divide-y divide-border" data-testid="list-saved-artifacts">
                      {artifactsQuery.data.map(a => (
                        <div
                          key={a.id}
                          className="flex items-center justify-between gap-2 p-2 text-xs"
                          data-testid={`row-artifact-${a.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {a.kind} v{a.version}
                            </Badge>
                            <div className="min-w-0">
                              <div className="text-foreground truncate" title={a.storageKey}>
                                {a.storageKey.split('/').slice(-1)[0]}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {(a.sizeBytes / 1024).toFixed(1)} KB · {a.storageBackend} ·{' '}
                                {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })} by {a.createdBy}
                              </div>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => downloadArtifact(a)}
                            data-testid={`button-download-artifact-${a.id}`}
                          >
                            <Download className="h-3 w-3 mr-1" /> Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit narrative dialog */}
      <Dialog open={narrativeEditOpen} onOpenChange={setNarrativeEditOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-edit-narrative">
          <DialogHeader>
            <DialogTitle>Edit Narrative</DialogTitle>
            <DialogDescription>
              {selectedReport ? `${selectedReport.id} · ${selectedReport.customerName}` : ''}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={narrativeDraft}
            onChange={(e) => setNarrativeDraft(e.target.value)}
            className="min-h-[220px]"
            data-testid="textarea-narrative"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNarrativeEditOpen(false)} data-testid="button-cancel-narrative">
              Cancel
            </Button>
            <Button onClick={handleSaveNarrative} disabled={patchReport.isPending} data-testid="button-save-narrative">
              {patchReport.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm submit dialog */}
      <Dialog open={!!confirmSubmit} onOpenChange={(open) => { if (!open) setConfirmSubmit(null); }}>
        <DialogContent data-testid="dialog-confirm-submit">
          <DialogHeader>
            <DialogTitle>Submit report to NFIU?</DialogTitle>
            <DialogDescription>
              This will mark <span className="font-mono">{confirmSubmit?.id}</span> as submitted and notify NFIU. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmSubmit(null)} data-testid="button-cancel-submit">
              Cancel
            </Button>
            <Button onClick={() => confirmSubmit && handleSubmitReport(confirmSubmit)} data-testid="button-confirm-submit">
              <Send className="h-4 w-4 mr-2" /> Confirm Submit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface NewReportDraftDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultType: ReportType;
  loading: boolean;
  onCreate: (payload: {
    type: ReportType;
    customerId: string;
    customerName: string;
    customerType: 'individual' | 'business';
    amount: number;
    reason: string;
    narrative: string;
    transactionIds: string[];
    flagsTriggered: string[];
  }) => Promise<void> | void;
}

function NewReportDraftDialog({ open, onOpenChange, defaultType, loading, onCreate }: NewReportDraftDialogProps) {
  const customers = useMemo(() => getCustomers(), []);
  const [type, setType] = useState<ReportType>(defaultType);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState('');
  const [narrative, setNarrative] = useState('');
  const [txnIds, setTxnIds] = useState('');

  useEffect(() => { if (open) setType(defaultType); }, [open, defaultType]);

  const reset = () => {
    setCustomerId(''); setAmount(''); setReason(''); setNarrative(''); setTxnIds('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const customer = customers.find(c => c.id === customerId);
    const amt = Number(amount);
    if (!customer || !amt || isNaN(amt) || !reason.trim() || !narrative.trim()) return;
    try {
      await onCreate({
        type,
        customerId: customer.id,
        customerName: customer.type === 'individual' ? customer.fullName : customer.companyName,
        customerType: customer.type,
        amount: amt,
        reason: reason.trim(),
        narrative: narrative.trim(),
        transactionIds: txnIds.split(',').map(s => s.trim()).filter(Boolean),
        flagsTriggered: [],
      });
      reset();
    } catch {
      // Parent toasts the error; keep form values so the user can retry.
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-xl" data-testid="dialog-new-draft">
        <DialogHeader>
          <DialogTitle>New {type} Draft</DialogTitle>
          <DialogDescription>Create a draft regulatory report. You can edit the narrative and submit later.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
                <SelectTrigger data-testid="select-draft-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STR">STR · Suspicious Transaction</SelectItem>
                  <SelectItem value="CTR">CTR · Currency Transaction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Amount (NGN) *</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                data-testid="input-draft-amount"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger data-testid="select-draft-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {customers.slice(0, 50).map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.type === 'individual' ? c.fullName : c.companyName} · {c.accountNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Reason *</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Structuring detected across multiple transfers"
              data-testid="input-draft-reason"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Narrative *</Label>
            <Textarea
              rows={4}
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              placeholder="Describe the suspicious activity, parties involved and supporting evidence..."
              data-testid="input-draft-narrative"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Transaction IDs (comma-separated)</Label>
            <Input
              value={txnIds}
              onChange={(e) => setTxnIds(e.target.value)}
              placeholder="TXN-001, TXN-002"
              data-testid="input-draft-txns"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-draft">Cancel</Button>
            <Button type="submit" disabled={loading} data-testid="button-submit-draft">
              {loading ? 'Creating…' : 'Create Draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
