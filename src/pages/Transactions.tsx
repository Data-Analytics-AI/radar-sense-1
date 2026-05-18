import { useMemo, useState } from 'react';
import { 
  FileText, Search, Download, Filter, Eye, 
  ChevronRight, Briefcase, Info,
  SlidersHorizontal, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { RiskScoreBadge } from '@/components/dashboard/RiskScoreBadge';
import { useTransactionsQuery } from '@/hooks/use-transactions-api';
import { Transaction } from '@/types';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useDetailsSelection } from '@/hooks/useDetailsSelection';
import { DetailsDrawer } from '@/components/DetailsDrawer';
import { TransactionDetailsPanel } from '@/components/TransactionDetailsPanel';
import { useToast } from '@/hooks/use-toast';

const riskDriverLabels: Record<string, string> = {
  velocity: 'Velocity', geo: 'Geography', device: 'Device', amount: 'Amount',
};

const getRiskDrivers = (txn: Transaction) => {
  const drivers: string[] = [];
  if (txn.amount > 5000) drivers.push('amount');
  if (txn.rulesTriggered.some(r => r.toLowerCase().includes('velocity'))) drivers.push('velocity');
  if (txn.rulesTriggered.some(r => r.toLowerCase().includes('geo') || r.toLowerCase().includes('location') || r.toLowerCase().includes('country'))) drivers.push('geo');
  if (txn.rulesTriggered.some(r => r.toLowerCase().includes('device'))) drivers.push('device');
  if (!drivers.length && txn.riskLevel !== 'low') drivers.push('amount');
  return drivers;
};

const SummaryStrip = ({ transactions }: { transactions: Transaction[] }) => {
  const totalValue = transactions.reduce((s, t) => s + t.amount, 0);
  const highRiskPct = transactions.length ? ((transactions.filter(t => t.riskLevel === 'high' || t.riskLevel === 'critical').length / transactions.length) * 100).toFixed(1) : '0';
  const crossBorderPct = transactions.length ? ((transactions.filter(t => t.geoLocation.country !== 'United States').length / transactions.length) * 100).toFixed(1) : '0';
  const avgRisk = transactions.length ? (transactions.reduce((s, t) => s + t.riskScore, 0) / transactions.length).toFixed(0) : '0';

  const items = [
    { label: 'Total Transactions', value: transactions.length.toLocaleString(), tooltip: 'Count of transactions matching current filters.' },
    { label: 'Total Value', value: `$${(totalValue / 1e6).toFixed(2)}M`, tooltip: 'Sum of all transaction amounts in current view.' },
    { label: 'High-Risk', value: `${highRiskPct}%`, tooltip: 'Percentage of transactions scored as High or Critical risk.' },
    { label: 'Cross-Border', value: `${crossBorderPct}%`, tooltip: 'Percentage of transactions originating outside the United States.' },
    { label: 'Avg Risk Score', value: avgRisk, tooltip: 'Mean risk score across all transactions in current view.' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {items.map(item => (
        <div key={item.label} className="stat-card p-3">
          <div className="flex items-center gap-1">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <Tooltip delayDuration={200}>
              <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
              <TooltipContent className="max-w-[200px] text-xs">{item.tooltip}</TooltipContent>
            </Tooltip>
          </div>
          <p className="text-lg font-bold tracking-tight mt-0.5">{item.value}</p>
        </div>
      ))}
    </div>
  );
};

const PAGE_SIZE = 50;

const Transactions = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [riskRange, setRiskRange] = useState<[number, number]>([0, 100]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(0);
  const { selectedId, isOpen, select, deselect } = useDetailsSelection('selected');

  const { data: txnData, isLoading } = useTransactionsQuery({ limit: 2000 });
  const transactions = useMemo(() => txnData ?? [], [txnData]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(txn => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!txn.id.toLowerCase().includes(q) && !txn.customerId.toLowerCase().includes(q) && !txn.merchantName.toLowerCase().includes(q)) return false;
      }
      if (typeFilter !== 'all' && txn.type !== typeFilter) return false;
      if (statusFilter !== 'all' && txn.status !== statusFilter) return false;
      if (riskFilter !== 'all' && txn.riskLevel !== riskFilter) return false;
      if (txn.riskScore < riskRange[0] || txn.riskScore > riskRange[1]) return false;
      return true;
    });
  }, [transactions, searchQuery, typeFilter, statusFilter, riskFilter, riskRange]);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pagedTransactions = useMemo(
    () => filteredTransactions.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE),
    [filteredTransactions, safePage],
  );

  const handleExport = () => {
    if (filteredTransactions.length === 0) {
      toast({ title: 'Nothing to export', description: 'Adjust filters to include at least one transaction.', variant: 'destructive' });
      return;
    }
    const headers = ['ID','Timestamp','Customer','Account','Type','Channel','Amount','Currency','Status','Merchant','MCC','Country','City','IP','Device','RiskScore','RiskLevel','MLProb','RulesTriggered','Description'];
    const esc = (v: unknown) => {
      const s = v === undefined || v === null ? '' : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filteredTransactions.map(t => [
      t.id, t.timestamp, t.customerId, t.accountId, t.type, t.channel, t.amount.toFixed(2), t.currency,
      t.status, t.merchantName, t.merchantCategoryCode, t.geoLocation.country, t.geoLocation.city,
      t.ipAddress, t.deviceId, t.riskScore, t.riskLevel, t.mlProbability.toFixed(4),
      t.rulesTriggered.join('; '), t.description,
    ]);
    const csv = headers.join(',') + '\n' + rows.map(r => r.map(esc).join(',')).join('\n') + '\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const fileName = `transactions_export_${Date.now()}.csv`;
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast({ title: 'Export complete', description: `${fileName} (${filteredTransactions.length} transactions) downloaded.` });
  };

  const selectedTransaction = useMemo(() => {
    if (!selectedId) return null;
    return transactions.find(t => t.id === selectedId) || null;
  }, [selectedId, transactions]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);

  const clearFilters = () => {
    setSearchQuery('');
    setTypeFilter('all');
    setStatusFilter('all');
    setRiskFilter('all');
    setRiskRange([0, 100]);
  };

  const hasActiveFilters = searchQuery || typeFilter !== 'all' || statusFilter !== 'all' || riskFilter !== 'all' || riskRange[0] !== 0 || riskRange[1] !== 100;

  const handleRowClick = (txnId: string) => {
    select(txnId);
  };

  const handleChevronClick = (e: React.MouseEvent, txnId: string) => {
    e.stopPropagation();
    select(txnId);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, txnId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(txnId);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Transactions
          </h1>
          <p className="text-muted-foreground">Single source of truth for all transaction activity</p>
        </div>
        <Button variant="outline" onClick={handleExport} data-testid="button-export"><Download className="h-4 w-4 mr-2" />Export</Button>
      </div>

      <SummaryStrip transactions={filteredTransactions} />

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by ID, customer, or merchant..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" data-testid="input-search-transactions" />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-type-filter"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="credit_card">Credit Card</SelectItem>
              <SelectItem value="wire_transfer">Wire Transfer</SelectItem>
              <SelectItem value="ach">ACH</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="atm">ATM</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-status-filter"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-risk-filter"><SelectValue placeholder="Risk Level" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={showAdvanced ? 'default' : 'outline'} size="icon" onClick={() => setShowAdvanced(!showAdvanced)} data-testid="button-advanced-filters">
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs text-muted-foreground" data-testid="button-clear-filters">
              <X className="h-3 w-3 mr-1" />Clear
            </Button>
          )}
        </div>
        {showAdvanced && (
          <div className="stat-card p-4 flex flex-wrap items-center gap-6">
            <div className="space-y-1 min-w-[200px]">
              <p className="text-xs text-muted-foreground">Risk Score Range: {riskRange[0]} - {riskRange[1]}</p>
              <Slider min={0} max={100} step={1} value={riskRange} onValueChange={(v) => setRiskRange(v as [number, number])} className="w-48" />
            </div>
          </div>
        )}
      </div>

      <div className="stat-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Date/Time</th>
                <th>Type</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Merchant</th>
                <th>Risk Drivers</th>
                <th>Confidence</th>
                <th>Risk</th>
                <th>Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {pagedTransactions.map((txn) => {
                const isSelected = selectedId === txn.id;
                const drivers = getRiskDrivers(txn);
                return (
                  <tr
                    key={txn.id}
                    className={cn(
                      'cursor-pointer transition-colors',
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/40'
                    )}
                    onClick={() => handleRowClick(txn.id)}
                    onKeyDown={(e) => handleRowKeyDown(e, txn.id)}
                    tabIndex={0}
                    role="button"
                    aria-selected={isSelected}
                    data-testid={`row-transaction-${txn.id}`}
                  >
                    <td className="font-mono text-xs">{txn.id}</td>
                    <td className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(txn.timestamp), 'MMM d, yyyy HH:mm:ss')}</td>
                    <td>
                      <span className="text-xs capitalize">{txn.type.replace('_', ' ')}</span>
                    </td>
                    <td className="font-mono text-xs">{txn.customerId}</td>
                    <td className={cn('font-semibold', txn.amount > 5000 && 'text-warning', txn.amount > 10000 && 'text-destructive')}>{formatAmount(txn.amount)}</td>
                    <td className="max-w-[150px]">
                      <p className="text-sm truncate">{txn.merchantName}</p>
                      <p className="text-xs text-muted-foreground">MCC: {txn.merchantCategoryCode}</p>
                    </td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {drivers.map(d => (
                          <Badge key={d} variant="outline" className="text-[10px] capitalize px-1.5 py-0">{riskDriverLabels[d] || d}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="text-xs font-mono">{(txn.mlProbability * 100).toFixed(0)}%</td>
                    <td><RiskScoreBadge score={txn.riskScore} level={txn.riskLevel} size="sm" /></td>
                    <td>
                      <Badge variant="outline" className={cn('text-xs capitalize',
                        txn.status === 'completed' && 'border-success/30 text-success',
                        txn.status === 'pending' && 'border-warning/30 text-warning',
                        txn.status === 'declined' && 'border-destructive/30 text-destructive'
                      )}>{txn.status}</Badge>
                    </td>
                    <td>
                      <button
                        onClick={(e) => handleChevronClick(e, txn.id)}
                        className="p-1 rounded-md hover:bg-muted transition-colors"
                        aria-expanded={isSelected}
                        aria-label={`View details for ${txn.id}`}
                        data-testid={`button-chevron-${txn.id}`}
                      >
                        <ChevronRight className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          isSelected && 'rotate-90'
                        )} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground" data-testid="text-transaction-count">
          Showing {pagedTransactions.length === 0 ? 0 : safePage * PAGE_SIZE + 1}
          –{safePage * PAGE_SIZE + pagedTransactions.length} of {filteredTransactions.length}
          {filteredTransactions.length !== transactions.length && ` (filtered from ${transactions.length})`}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground" data-testid="text-page-indicator">
            Page {safePage + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage === 0}
            onClick={() => setPage(p => Math.max(0, p - 1))}
            data-testid="button-prev-page"
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages - 1}
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            data-testid="button-next-page"
          >
            Next
          </Button>
        </div>
      </div>

      <DetailsDrawer
        open={isOpen && selectedTransaction !== null}
        onOpenChange={(open) => { if (!open) deselect(); }}
        title={selectedTransaction ? selectedTransaction.id : ''}
        description="Transaction Details"
      >
        {selectedTransaction && <TransactionDetailsPanel transaction={selectedTransaction} />}
      </DetailsDrawer>
    </div>
  );
};

export default Transactions;
