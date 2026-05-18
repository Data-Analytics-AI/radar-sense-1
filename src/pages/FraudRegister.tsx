import { useMemo, useState } from 'react';
import {
  AlertOctagon, Search, Plus, Download, Eye, FileText,
  ShieldCheck, TrendingDown, TrendingUp, Wallet,
  CheckCircle2, Clock, Activity, XCircle, BookMarked,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { getCustomers, type FraudRegisterEntry, type FraudRegisterStatus } from '@/lib/compliance-data';
import { useFraudRegisterQuery, useCreateFraudEntry, usePatchFraudEntry, useAppendFraudTimeline } from '@/hooks/use-regulatory-fraud-api';

const formatNgn = (n: number) => '₦' + n.toLocaleString();
const formatNgnShort = (n: number) => {
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toLocaleString()}`;
};

const FRAUD_TYPE_LABELS: Record<FraudRegisterEntry['fraudType'], string> = {
  card_fraud: 'Card Fraud',
  wire_fraud: 'Wire Fraud',
  identity_theft: 'Identity Theft',
  phishing: 'Phishing',
  account_takeover: 'Account Takeover',
  merchant_fraud: 'Merchant Fraud',
  mule_account: 'Mule Account',
  cheque_fraud: 'Cheque Fraud',
  sim_swap: 'SIM Swap',
};

const fraudTypeColor = (t: FraudRegisterEntry['fraudType']) => {
  switch (t) {
    case 'card_fraud': return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    case 'wire_fraud': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'identity_theft': return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    case 'phishing': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'account_takeover': return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    case 'merchant_fraud': return 'bg-pink-500/10 text-pink-600 border-pink-500/20';
    case 'mule_account': return 'bg-fuchsia-500/10 text-fuchsia-600 border-fuchsia-500/20';
    case 'cheque_fraud': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'sim_swap': return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
    default: return 'bg-muted text-muted-foreground border-border';
  }
};

const statusColor = (s: FraudRegisterStatus) => {
  switch (s) {
    case 'open': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'investigating': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'recovered': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'closed': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'written_off': return 'bg-muted text-muted-foreground border-border';
  }
};

const KPI = ({ label, value, icon: Icon, accent, sub }: { label: string; value: string | number; icon: React.ElementType; accent?: string; sub?: string }) => (
  <div className="stat-card" data-testid={`kpi-${label.toLowerCase().replace(/\s|\//g, '-')}`}>
    <div className="flex items-center justify-between mb-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <Icon className={cn('h-4 w-4', accent ?? 'text-muted-foreground')} />
    </div>
    <p className={cn('text-2xl font-bold', accent)}>{value}</p>
    {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

type GroupBy = 'none' | 'status' | 'type' | 'channel';

export default function FraudRegister() {
  const { toast } = useToast();
  const fraudQuery = useFraudRegisterQuery();
  const entries = useMemo(() => fraudQuery.data ?? [], [fraudQuery.data]);
  const customers = useMemo(() => getCustomers(), []);
  const patchEntry = usePatchFraudEntry();
  const createEntry = useCreateFraudEntry();
  const appendTimeline = useAppendFraudTimeline();
  const [timelineNote, setTimelineNote] = useState('');

  const handleAddTimelineNote = async () => {
    if (!selected || !timelineNote.trim()) return;
    try {
      const updated = await appendTimeline.mutateAsync({
        id: selected.id,
        entry: {
          type: 'note',
          title: 'Investigator note',
          description: timelineNote.trim(),
          performedBy: 'Current User',
        },
      });
      setSelected(updated);
      setTimelineNote('');
      toast({ title: 'Timeline updated', description: 'Note added to incident.' });
    } catch (err) {
      toast({
        title: 'Add note failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    }
  };
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [selected, setSelected] = useState<FraudRegisterEntry | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false;
      if (typeFilter !== 'all' && e.fraudType !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!e.id.toLowerCase().includes(q) &&
            !e.customerName.toLowerCase().includes(q) &&
            !e.accountNumber.toLowerCase().includes(q) &&
            !e.channel.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [entries, search, statusFilter, typeFilter]);

  const kpis = useMemo(() => {
    const total = entries.length;
    const open = entries.filter(e => e.status === 'open').length;
    const investigating = entries.filter(e => e.status === 'investigating').length;
    const recovered = entries.filter(e => e.status === 'recovered').length;
    const totalLoss = entries.reduce((s, e) => s + e.amountLost - e.amountRecovered, 0);
    const totalRecovered = entries.reduce((s, e) => s + e.amountRecovered, 0);
    const cbn = entries.filter(e => e.reportedToCbn).length;
    const nibss = entries.filter(e => e.reportedToNibss).length;
    const nfiu = entries.filter(e => e.reportedToNfiu).length;
    return { total, open, investigating, recovered, totalLoss, totalRecovered, cbn, nibss, nfiu };
  }, [entries]);

  const groups = useMemo(() => {
    if (groupBy === 'none') return [];
    const map = new Map<string, FraudRegisterEntry[]>();
    filtered.forEach(e => {
      const key = groupBy === 'status' ? e.status : groupBy === 'type' ? e.fraudType : e.channel;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      items,
      lost: items.reduce((s, e) => s + e.amountLost, 0),
      recovered: items.reduce((s, e) => s + e.amountRecovered, 0),
    }));
  }, [filtered, groupBy]);

  const handleExport = () => {
    if (filtered.length === 0) {
      toast({ title: 'Nothing to export', description: 'No incidents match the current filter.', variant: 'destructive' });
      return;
    }

    const fmtN = (n: number) => n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const dateFmt = (s?: string) => (s ? new Date(s).toISOString().slice(0, 10) : '');
    const csvEscape = (v: unknown) => {
      const s = v === undefined || v === null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const headers = [
      'Incident ID', 'Incident Date', 'Reported Date', 'Customer Name', 'Customer ID', 'Account Number',
      'Fraud Type', 'Channel', 'Amount Lost (NGN)', 'Amount Saved (NGN)', 'Amount Recovered (NGN)',
      'Net Loss (NGN)', 'Status', 'Description', 'Perpetrator', 'Linked Accounts', 'Linked Cases',
      'Resolution Notes', 'Reported to CBN', 'Reported to NIBSS', 'Reported to NFIU',
      'Assigned To', 'Closed Date',
    ];

    const rows = filtered.map(e => [
      e.id, dateFmt(e.incidentDate), dateFmt(e.reportedDate), e.customerName, e.customerId, e.accountNumber,
      e.fraudType.replace(/_/g, ' '), e.channel, fmtN(e.amountLost), fmtN(e.amountSaved), fmtN(e.amountRecovered),
      fmtN(e.amountLost - e.amountRecovered), e.status, e.description, e.perpetrator || '',
      e.linkedAccounts.join('; '), e.linkedCases.join('; '), e.resolutionNotes || '',
      e.reportedToCbn ? 'YES' : 'NO', e.reportedToNibss ? 'YES' : 'NO', e.reportedToNfiu ? 'YES' : 'NO',
      e.assignedTo, dateFmt(e.closedAt),
    ]);

    const totalLost = filtered.reduce((s, e) => s + e.amountLost, 0);
    const totalRec = filtered.reduce((s, e) => s + e.amountRecovered, 0);
    const totalSaved = filtered.reduce((s, e) => s + e.amountSaved, 0);
    const reportedCbn = filtered.filter(e => e.reportedToCbn).length;
    const reportedNibss = filtered.filter(e => e.reportedToNibss).length;
    const reportedNfiu = filtered.filter(e => e.reportedToNfiu).length;
    const stamp = new Date();
    const period = `${stamp.getFullYear()}-${String(stamp.getMonth() + 1).padStart(2, '0')}`;

    const meta = [
      `# CBN Fraud Monthly Return`,
      `# Institution,SnapFort Demo Bank`,
      `# Reporting Period,${period}`,
      `# Generated At,${stamp.toISOString()}`,
      `# Total Incidents,${filtered.length}`,
      `# Total Loss (NGN),${fmtN(totalLost)}`,
      `# Total Recovered (NGN),${fmtN(totalRec)}`,
      `# Total Prevented/Saved (NGN),${fmtN(totalSaved)}`,
      `# Net Loss (NGN),${fmtN(totalLost - totalRec)}`,
      `# Recovery Rate,${totalLost > 0 ? ((totalRec / totalLost) * 100).toFixed(2) + '%' : '0.00%'}`,
      `# Reported to CBN,${reportedCbn}`,
      `# Reported to NIBSS,${reportedNibss}`,
      `# Reported to NFIU,${reportedNfiu}`,
      ``,
    ].join('\n');

    const csv = meta
      + headers.map(csvEscape).join(',') + '\n'
      + rows.map(r => r.map(csvEscape).join(',')).join('\n') + '\n';

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const fileName = `CBN_Fraud_Return_${period}_${stamp.getTime()}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    toast({
      title: 'CBN Report Exported',
      description: `${fileName} (${filtered.length} incidents, ₦${fmtN(totalLost - totalRec)} net loss) downloaded.`,
    });
  };

  const handleMarkReported = async (id: string) => {
    try {
      const updated = await patchEntry.mutateAsync({
        id,
        patch: { reportedToCbn: true, reportedToNibss: true, reportedToNfiu: true },
      });
      if (selected?.id === id) setSelected(updated);
      toast({ title: 'Marked as Reported', description: `Incident ${id} flagged as reported to CBN, NIBSS & NFIU.` });
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' });
    }
  };

  const handleUpdateStatus = async (id: string, status: FraudRegisterStatus) => {
    try {
      const patch: { status: FraudRegisterStatus; closedAt?: string } = { status };
      if (status === 'closed' || status === 'recovered' || status === 'written_off') {
        patch.closedAt = new Date().toISOString();
      }
      const updated = await patchEntry.mutateAsync({ id, patch });
      if (selected?.id === id) setSelected(updated);
      toast({ title: 'Status Updated', description: `Incident ${id} → ${status.replace('_', ' ')}` });
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' });
    }
  };

  const handleToggleReportFlag = async (
    id: string,
    key: 'reportedToCbn' | 'reportedToNibss' | 'reportedToNfiu',
    value: boolean,
  ) => {
    try {
      const updated = await patchEntry.mutateAsync({ id, patch: { [key]: value } });
      if (selected?.id === id) setSelected(updated);
    } catch (err) {
      toast({ title: 'Update failed', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <BookMarked className="h-6 w-6 text-primary" />
            Fraud Register
          </h1>
          <p className="text-muted-foreground text-sm">CBN-compliant fraud incident logbook & recovery tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" onClick={handleExport} data-testid="button-export-cbn">
            <Download className="h-4 w-4 mr-2" /> Export CBN Report
          </Button>
          <Button onClick={() => setLogOpen(true)} data-testid="button-log-incident">
            <Plus className="h-4 w-4 mr-2" /> Log Incident
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <KPI label="Total Incidents" value={kpis.total} icon={AlertOctagon} />
        <KPI label="Open" value={kpis.open} icon={Clock} accent="text-red-600" />
        <KPI label="Investigating" value={kpis.investigating} icon={Activity} accent="text-amber-600" />
        <KPI label="Recovered" value={kpis.recovered} icon={CheckCircle2} accent="text-emerald-600" />
        <KPI label="Loss YTD" value={formatNgnShort(kpis.totalLoss)} icon={TrendingDown} accent="text-red-600" />
        <KPI label="Recovered YTD" value={formatNgnShort(kpis.totalRecovered)} icon={TrendingUp} accent="text-emerald-600" />
        <div className="stat-card" data-testid="kpi-reporting">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">Reported</p>
            <ShieldCheck className="h-4 w-4 text-primary" />
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge variant="outline" className="text-[10px]">CBN {kpis.cbn}</Badge>
            <Badge variant="outline" className="text-[10px]">NIBSS {kpis.nibss}</Badge>
            <Badge variant="outline" className="text-[10px]">NFIU {kpis.nfiu}</Badge>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by ID, customer, account, channel..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="filter-status"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="investigating">Investigating</SelectItem>
            <SelectItem value="recovered">Recovered</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="written_off">Written off</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44" data-testid="filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(FRAUD_TYPE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 ml-auto">
          <Label className="text-xs text-muted-foreground mr-1">Group by:</Label>
          {(['none', 'status', 'type', 'channel'] as const).map(g => (
            <Button
              key={g}
              size="sm"
              variant={groupBy === g ? 'default' : 'outline'}
              onClick={() => setGroupBy(g)}
              className="capitalize"
              data-testid={`button-group-${g}`}
            >
              {g}
            </Button>
          ))}
        </div>
      </div>

      {/* Group Summary Cards */}
      {groupBy !== 'none' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="group-summary">
          {groups.map(g => (
            <div key={g.key} className="stat-card">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium capitalize">
                  {groupBy === 'type' ? FRAUD_TYPE_LABELS[g.key as FraudRegisterEntry['fraudType']] : g.key.replace('_', ' ')}
                </span>
                <Badge variant="secondary" className="text-xs">{g.items.length}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Lost</p>
                  <p className="font-bold text-red-600">{formatNgnShort(g.lost)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Recovered</p>
                  <p className="font-bold text-emerald-600">{formatNgnShort(g.recovered)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="stat-card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b border-border">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Incident ID</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Channel</th>
                <th className="px-3 py-2 font-medium text-right">Amount Lost</th>
                <th className="px-3 py-2 font-medium text-right">Recovered</th>
                <th className="px-3 py-2 font-medium text-right">Net Loss</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Reporting</th>
                <th className="px-3 py-2 font-medium">Assigned</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const net = e.amountLost - e.amountRecovered;
                return (
                  <tr
                    key={e.id}
                    onClick={() => setSelected(e)}
                    className="border-b border-border/50 hover-elevate cursor-pointer"
                    data-testid={`row-incident-${e.id}`}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{e.id}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{format(new Date(e.incidentDate), 'MMM d, yyyy')}</td>
                    <td className="px-3 py-2">
                      <div className="text-xs font-medium truncate max-w-[180px]">{e.customerName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{e.accountNumber}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={cn('text-[10px]', fraudTypeColor(e.fraudType))}>
                        {FRAUD_TYPE_LABELS[e.fraudType]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{e.channel}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{formatNgnShort(e.amountLost)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-emerald-600">{formatNgnShort(e.amountRecovered)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs font-medium">{formatNgnShort(net)}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={cn('text-[10px] capitalize', statusColor(e.status))}>
                        {e.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {e.reportedToCbn && <Badge variant="outline" className="text-[9px]">CBN</Badge>}
                        {e.reportedToNibss && <Badge variant="outline" className="text-[9px]">NIBSS</Badge>}
                        {e.reportedToNfiu && <Badge variant="outline" className="text-[9px]">NFIU</Badge>}
                        {!e.reportedToCbn && !e.reportedToNibss && !e.reportedToNfiu && (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{e.assignedTo}</td>
                    <td className="px-3 py-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setSelected(e)} data-testid={`button-view-${e.id}`}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Select value={e.status} onValueChange={(v) => handleUpdateStatus(e.id, v as FraudRegisterStatus)}>
                          <SelectTrigger className="h-7 w-28 text-[10px]" data-testid={`select-status-${e.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="open">Open</SelectItem>
                            <SelectItem value="investigating">Investigating</SelectItem>
                            <SelectItem value="recovered">Recovered</SelectItem>
                            <SelectItem value="closed">Closed</SelectItem>
                            <SelectItem value="written_off">Written off</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => handleMarkReported(e.id)} data-testid={`button-report-${e.id}`}>
                          Mark Reported
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    <AlertOctagon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    No fraud incidents match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="sheet-incident-detail">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono">{selected.id}</span>
                  <Badge variant="outline" className={cn('text-xs capitalize', statusColor(selected.status))}>
                    {selected.status.replace('_', ' ')}
                  </Badge>
                  <Badge variant="outline" className={cn('text-xs', fraudTypeColor(selected.fraudType))}>
                    {FRAUD_TYPE_LABELS[selected.fraudType]}
                  </Badge>
                </SheetTitle>
                <SheetDescription>
                  {selected.customerName} · {selected.accountNumber} · Assigned to {selected.assignedTo}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Amount summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20">
                    <p className="text-[10px] text-muted-foreground">Amount Lost</p>
                    <p className="text-lg font-bold text-red-600">{formatNgn(selected.amountLost)}</p>
                  </div>
                  <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-[10px] text-muted-foreground">Recovered</p>
                    <p className="text-lg font-bold text-emerald-600">{formatNgn(selected.amountRecovered)}</p>
                  </div>
                  <div className="p-3 rounded-md bg-muted/40 border border-border">
                    <p className="text-[10px] text-muted-foreground">Net Loss</p>
                    <p className="text-lg font-bold">{formatNgn(selected.amountLost - selected.amountRecovered)}</p>
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <h4 className="text-sm font-semibold mb-3">Timeline</h4>
                  <div className="space-y-3 border-l-2 border-border pl-4">
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-red-500" />
                      <p className="text-xs font-medium">Incident occurred</p>
                      <p className="text-[11px] text-muted-foreground">{format(new Date(selected.incidentDate), 'PPpp')}</p>
                    </div>
                    <div className="relative">
                      <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <p className="text-xs font-medium">Reported</p>
                      <p className="text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(selected.reportedDate), { addSuffix: true })}</p>
                    </div>
                    {(selected.status === 'investigating' || selected.status === 'recovered' || selected.status === 'closed') && (
                      <div className="relative">
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                        <p className="text-xs font-medium">Investigation in progress</p>
                        <p className="text-[11px] text-muted-foreground">Assigned to {selected.assignedTo}</p>
                      </div>
                    )}
                    {selected.closedAt && (
                      <div className="relative">
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <p className="text-xs font-medium">Resolved · {selected.status.replace('_', ' ')}</p>
                        <p className="text-[11px] text-muted-foreground">{format(new Date(selected.closedAt), 'PPP')}</p>
                      </div>
                    )}
                    {(selected.timeline ?? []).map((ev) => (
                      <div key={ev.id} className="relative" data-testid={`timeline-event-${ev.id}`}>
                        <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-purple-500" />
                        <p className="text-xs font-medium">{ev.title}</p>
                        {ev.description && <p className="text-[11px] text-muted-foreground">{ev.description}</p>}
                        <p className="text-[10px] text-muted-foreground/80">{ev.performedBy} · {format(new Date(ev.timestamp), 'PPpp')}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Input
                      value={timelineNote}
                      onChange={(e) => setTimelineNote(e.target.value)}
                      placeholder="Add timeline note…"
                      data-testid="input-timeline-note"
                      className="text-xs"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddTimelineNote}
                      disabled={!timelineNote.trim() || appendTimeline.isPending}
                      data-testid="button-add-timeline-note"
                    >
                      {appendTimeline.isPending ? '…' : 'Add'}
                    </Button>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <h4 className="text-sm font-semibold mb-1">Description</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">{selected.description}</p>
                </div>

                {/* Perpetrator */}
                {selected.perpetrator && (
                  <div>
                    <h4 className="text-sm font-semibold mb-1">Perpetrator</h4>
                    <p className="text-xs text-muted-foreground">{selected.perpetrator}</p>
                  </div>
                )}

                {/* Linked accounts & cases */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Linked Accounts</h4>
                    <div className="space-y-1">
                      {selected.linkedAccounts.map(a => (
                        <div key={a} className="text-xs font-mono p-1.5 rounded bg-muted/40">{a}</div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Linked Cases</h4>
                    <div className="space-y-1">
                      {selected.linkedCases.map(c => (
                        <div key={c} className="text-xs font-mono p-1.5 rounded bg-muted/40">{c}</div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Resolution notes */}
                {selected.resolutionNotes && (
                  <div>
                    <h4 className="text-sm font-semibold mb-1">Resolution Notes</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">{selected.resolutionNotes}</p>
                  </div>
                )}

                {/* Regulatory reporting */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-primary" /> Regulatory Reporting
                  </h4>
                  <div className="space-y-2 p-3 rounded-md border border-border">
                    {([
                      ['reportedToCbn', 'Reported to CBN'],
                      ['reportedToNibss', 'Reported to NIBSS'],
                      ['reportedToNfiu', 'Reported to NFIU'],
                    ] as const).map(([key, label]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox
                          id={`chk-${key}`}
                          checked={selected[key]}
                          onCheckedChange={(v) => handleToggleReportFlag(selected.id, key, !!v)}
                          data-testid={`checkbox-${key}`}
                        />
                        <Label htmlFor={`chk-${key}`} className="text-xs cursor-pointer">{label}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <SheetFooter className="mt-6">
                <Button variant="outline" onClick={() => setSelected(null)} data-testid="button-close-detail">Close</Button>
                <Button onClick={() => handleMarkReported(selected.id)} data-testid="button-mark-all-reported">
                  <ShieldCheck className="h-4 w-4 mr-2" /> Mark All Reported
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Log Incident Sheet */}
      <LogIncidentSheet
        open={logOpen}
        onOpenChange={setLogOpen}
        customers={customers}
        submitting={createEntry.isPending}
        onCreate={async (entry) => {
          try {
            const created = await createEntry.mutateAsync(entry);
            toast({ title: 'Incident Logged', description: `${created.id} added to fraud register.` });
            return true;
          } catch (err) {
            toast({ title: 'Log failed', description: err instanceof Error ? err.message : 'Try again', variant: 'destructive' });
            return false;
          }
        }}
      />
    </div>
  );
}

interface LogIncidentSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  customers: ReturnType<typeof getCustomers>;
  submitting: boolean;
  onCreate: (entry: FraudRegisterEntry) => Promise<boolean>;
}

function LogIncidentSheet({ open, onOpenChange, customers, submitting, onCreate }: LogIncidentSheetProps) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState('');
  const [fraudType, setFraudType] = useState<FraudRegisterEntry['fraudType']>('card_fraud');
  const [channel, setChannel] = useState('Web');
  const [amountLost, setAmountLost] = useState<string>('');
  const [description, setDescription] = useState('');
  const [perpetrator, setPerpetrator] = useState('');
  const [linkedAccounts, setLinkedAccounts] = useState('');
  const [reportedToCbn, setReportedToCbn] = useState(false);
  const [reportedToNibss, setReportedToNibss] = useState(false);
  const [reportedToNfiu, setReportedToNfiu] = useState(false);

  const reset = () => {
    setCustomerId(''); setFraudType('card_fraud'); setChannel('Web');
    setAmountLost(''); setDescription(''); setPerpetrator(''); setLinkedAccounts('');
    setReportedToCbn(false); setReportedToNibss(false); setReportedToNfiu(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const customer = customers.find(c => c.id === customerId);
    const lost = Number(amountLost);
    if (!customer || !lost || isNaN(lost) || !description.trim()) {
      toast({ title: 'Validation Error', description: 'Customer, amount lost and description are required.', variant: 'destructive' });
      return;
    }
    const id = `FR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const now = new Date().toISOString();
    const entry: FraudRegisterEntry = {
      id,
      incidentDate: now,
      reportedDate: now,
      customerId: customer.id,
      customerName: customer.type === 'individual' ? customer.fullName : customer.companyName,
      accountNumber: customer.accountNumber,
      fraudType,
      channel,
      amountLost: lost,
      amountSaved: 0,
      amountRecovered: 0,
      status: 'open',
      description: description.trim(),
      perpetrator: perpetrator.trim() || 'Unknown',
      linkedAccounts: linkedAccounts.split(',').map(s => s.trim()).filter(Boolean),
      linkedCases: [],
      reportedToCbn,
      reportedToNibss,
      reportedToNfiu,
      assignedTo: 'Unassigned',
    };
    const ok = await onCreate(entry);
    if (ok) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="sheet-log-incident">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" /> Log Fraud Incident
          </SheetTitle>
          <SheetDescription>Record a new fraud incident in the CBN-compliant register.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="customer">Customer *</Label>
            <Select value={customerId} onValueChange={setCustomerId}>
              <SelectTrigger data-testid="select-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
              <SelectContent className="max-h-72">
                {customers.slice(0, 50).map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.type === 'individual' ? c.fullName : c.companyName} · {c.accountNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Fraud Type *</Label>
              <Select value={fraudType} onValueChange={(v) => setFraudType(v as FraudRegisterEntry['fraudType'])}>
                <SelectTrigger data-testid="select-fraud-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(FRAUD_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Channel *</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger data-testid="select-channel"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['Web', 'Mobile', 'POS', 'ATM', 'Branch', 'Wire'].map(ch => (
                    <SelectItem key={ch} value={ch}>{ch}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount Lost (NGN) *</Label>
            <div className="relative">
              <Wallet className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="amount"
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={amountLost}
                onChange={(e) => setAmountLost(e.target.value)}
                className="pl-9"
                data-testid="input-amount"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description *</Label>
            <Textarea
              id="desc"
              rows={3}
              placeholder="Briefly describe the incident..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              data-testid="input-description"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="perp">Perpetrator</Label>
            <Input
              id="perp"
              placeholder="e.g., External actor (Lagos)"
              value={perpetrator}
              onChange={(e) => setPerpetrator(e.target.value)}
              data-testid="input-perpetrator"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="linked">Linked Accounts (comma-separated)</Label>
            <Input
              id="linked"
              placeholder="0123456789, 0987654321"
              value={linkedAccounts}
              onChange={(e) => setLinkedAccounts(e.target.value)}
              data-testid="input-linked-accounts"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Reporting Flags</Label>
            <div className="space-y-1.5 p-3 rounded-md border border-border">
              <div className="flex items-center gap-2">
                <Checkbox id="r-cbn" checked={reportedToCbn} onCheckedChange={(v) => setReportedToCbn(!!v)} data-testid="form-checkbox-cbn" />
                <Label htmlFor="r-cbn" className="text-xs cursor-pointer">Reported to CBN</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="r-nibss" checked={reportedToNibss} onCheckedChange={(v) => setReportedToNibss(!!v)} data-testid="form-checkbox-nibss" />
                <Label htmlFor="r-nibss" className="text-xs cursor-pointer">Reported to NIBSS</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="r-nfiu" checked={reportedToNfiu} onCheckedChange={(v) => setReportedToNfiu(!!v)} data-testid="form-checkbox-nfiu" />
                <Label htmlFor="r-nfiu" className="text-xs cursor-pointer">Reported to NFIU</Label>
              </div>
            </div>
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel">
              <XCircle className="h-4 w-4 mr-2" /> Cancel
            </Button>
            <Button type="submit" disabled={submitting} data-testid="button-submit-incident">
              <FileText className="h-4 w-4 mr-2" /> {submitting ? 'Logging…' : 'Log Incident'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
