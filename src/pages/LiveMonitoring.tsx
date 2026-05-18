import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Activity, Pause, Play, Filter, RefreshCw, 
  Gauge, ShieldAlert, Ban, TrendingUp, TrendingDown,
  ChevronRight, Info
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RiskScoreBadge } from '@/components/dashboard/RiskScoreBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTransactionsQuery } from '@/hooks/use-transactions-api';
import { useQuery } from '@tanstack/react-query';
import { Transaction } from '@/types';
import { cn } from '@/lib/utils';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, 
  ComposedChart, Bar
} from 'recharts';
import { useDetailsSelection } from '@/hooks/useDetailsSelection';
import { DetailsDrawer } from '@/components/DetailsDrawer';
import { TransactionDetailsPanel } from '@/components/TransactionDetailsPanel';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';

const calcFraudPressure = (txns: Transaction[]) => {
  if (!txns.length) return 0;
  const highRiskCount = txns.filter(t => t.riskLevel === 'high' || t.riskLevel === 'critical').length;
  const avgRisk = txns.reduce((s, t) => s + t.riskScore, 0) / txns.length;
  const declinedRate = txns.filter(t => t.status === 'declined').length / txns.length;
  return Math.min(100, Math.round((highRiskCount / txns.length) * 40 + avgRisk * 0.4 + declinedRate * 20));
};

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

const liveInsights = [
  { text: '3 merchants showing abnormal spend velocity in the last 30 minutes', severity: 'high' as const },
  { text: 'New country detected for 12 customers compared to 7-day baseline', severity: 'medium' as const },
  { text: 'Increase in emulator-based mobile transactions (up 18% vs. hourly avg)', severity: 'high' as const },
  { text: 'Wire transfer volume elevated 2.1x above normal for this time window', severity: 'medium' as const },
  { text: 'Card-testing pattern detected across 2 merchant endpoints', severity: 'critical' as const },
];

const LiveMonitoring = () => {
  const [isLive, setIsLive] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showHighRiskOverlay, setShowHighRiskOverlay] = useState(false);
  const [velocity, setVelocity] = useState(0);
  const [velocityTrend, setVelocityTrend] = useState(0);
  const [blockedValue, setBlockedValue] = useState(0);
  const [cachedSelection, setCachedSelection] = useState<Transaction | null>(null);
  const [feedFilter, setFeedFilter] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const { selectedId, isOpen, select, deselect } = useDetailsSelection('selected');
  const { toast } = useToast();

  const { data: liveData, refetch: refetchLive } = useTransactionsQuery(
    { limit: 20 },
    { refetchInterval: isLive ? 4000 : false },
  );
  const { data: hourlyData = [] } = useQuery<Array<{ timestamp: string; value: number; highRiskPct: number; label: string }>>({
    queryKey: ['/api/transactions/hourly', { hours: 24 }],
    queryFn: async () => {
      const res = await fetch('/api/transactions/hourly?hours=24', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: isLive ? 60_000 : false,
  });

  const seenIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!liveData) return;
    setTransactions(liveData);
    setVelocity(Math.floor(Math.random() * 50) + 110);
    setVelocityTrend(parseFloat((Math.random() * 10 - 5).toFixed(1)));
    let added = 0;
    for (const t of liveData) {
      if (!seenIds.current.has(t.id)) {
        seenIds.current.add(t.id);
        if (t.status === 'declined') added += t.amount;
      }
    }
    if (added > 0) setBlockedValue(prev => prev + added);
  }, [liveData]);

  useEffect(() => {
    if (blockedValue === 0) setBlockedValue(Math.round(Math.random() * 50000 + 15000));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedTransaction = useMemo(() => {
    if (!selectedId) return null;
    const found = transactions.find(t => t.id === selectedId);
    if (found) return found;
    return cachedSelection;
  }, [selectedId, transactions, cachedSelection]);

  useEffect(() => {
    if (!selectedId) {
      setCachedSelection(null);
      return;
    }
    const found = transactions.find(t => t.id === selectedId);
    if (found) {
      setCachedSelection(found);
    }
  }, [selectedId, transactions]);

  const fraudPressure = useMemo(() => calcFraudPressure(transactions), [transactions]);

  const riskDistribution = useMemo(() => {
    const dist = { low: 0, medium: 0, high: 0, critical: 0 };
    transactions.forEach(t => dist[t.riskLevel]++);
    return dist;
  }, [transactions]);

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount);

  const formatTime = (timestamp: string) =>
    new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const pressureColor = fraudPressure < 30 ? 'text-success' : fraudPressure < 60 ? 'text-warning' : 'text-destructive';

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
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
            Live Monitoring
            {isLive && (
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-success" />
              </span>
            )}
          </h1>
          <p className="text-muted-foreground">Real-time transaction stream and risk situational awareness</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={isLive ? 'default' : 'outline'} size="sm" onClick={() => setIsLive(!isLive)} data-testid="button-toggle-live">
            {isLive ? <><Pause className="h-4 w-4 mr-2" />Pause</> : <><Play className="h-4 w-4 mr-2" />Resume</>}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={feedFilter !== 'all' ? 'default' : 'outline'} size="sm" data-testid="button-filter">
                <Filter className="h-4 w-4 mr-2" />Filter
                {feedFilter !== 'all' && <Badge variant="secondary" className="ml-2 capitalize">{feedFilter}</Badge>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="end">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">Risk level</p>
                {(['all', 'critical', 'high', 'medium', 'low'] as const).map(level => (
                  <Button
                    key={level}
                    variant={feedFilter === level ? 'default' : 'ghost'}
                    size="sm"
                    className="w-full justify-start capitalize"
                    onClick={() => setFeedFilter(level)}
                    data-testid={`filter-${level}`}
                  >
                    {level}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              refetchLive();
              toast({ title: 'Feed refreshed', description: 'Loaded a fresh batch of transactions.' });
            }}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Transaction Velocity</p>
              <p className="text-3xl font-bold tracking-tight">{velocity}<span className="text-sm font-normal text-muted-foreground">/min</span></p>
              <div className={cn('flex items-center gap-1 text-xs font-medium', velocityTrend >= 0 ? 'text-success' : 'text-destructive')}>
                {velocityTrend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span>{Math.abs(velocityTrend)}%</span>
                <span className="text-muted-foreground">vs. 1h avg</span>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-primary/10"><Activity className="h-5 w-5 text-primary" /></div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Risk Distribution</p>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" /><span className="text-xs font-semibold">{riskDistribution.low}</span></div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" /><span className="text-xs font-semibold">{riskDistribution.medium}</span></div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500" /><span className="text-xs font-semibold">{riskDistribution.high}</span></div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" /><span className="text-xs font-semibold">{riskDistribution.critical}</span></div>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden mt-2">
                <div className="bg-success" style={{ width: `${(riskDistribution.low / 20) * 100}%` }} />
                <div className="bg-warning" style={{ width: `${(riskDistribution.medium / 20) * 100}%` }} />
                <div className="bg-orange-500" style={{ width: `${(riskDistribution.high / 20) * 100}%` }} />
                <div className="bg-destructive" style={{ width: `${(riskDistribution.critical / 20) * 100}%` }} />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-warning/10"><ShieldAlert className="h-5 w-5 text-warning" /></div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                <p className="text-sm font-medium text-muted-foreground">Fraud Pressure Index</p>
                <Tooltip delayDuration={200}>
                  <TooltipTrigger asChild><Info className="h-3 w-3 text-muted-foreground cursor-help" /></TooltipTrigger>
                  <TooltipContent className="max-w-[220px] text-xs">Composite score (0-100) based on high-risk ratio, avg risk score, and decline rate.</TooltipContent>
                </Tooltip>
              </div>
              <p className={cn('text-3xl font-bold tracking-tight', pressureColor)}>{fraudPressure}</p>
              <p className="text-xs text-muted-foreground">{fraudPressure < 30 ? 'Normal' : fraudPressure < 60 ? 'Elevated' : 'High'} pressure</p>
            </div>
            <div className={cn('p-3 rounded-lg', fraudPressure < 30 ? 'bg-success/10' : fraudPressure < 60 ? 'bg-warning/10' : 'bg-destructive/10')}>
              <Gauge className={cn('h-5 w-5', pressureColor)} />
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Blocked Value</p>
              <p className="text-3xl font-bold tracking-tight">{formatAmount(blockedValue)}</p>
              <p className="text-xs text-muted-foreground">Loss prevented this session</p>
            </div>
            <div className="p-3 rounded-lg bg-destructive/10"><Ban className="h-5 w-5 text-destructive" /></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="stat-card xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">Transaction Volume (Last 24h)</h3>
            <Button
              variant={showHighRiskOverlay ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => setShowHighRiskOverlay(!showHighRiskOverlay)}
              data-testid="button-toggle-overlay"
            >
              {showHighRiskOverlay ? 'Volume + High-Risk %' : 'Volume Only'}
            </Button>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={hourlyData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradient-vol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval={3} />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                {showHighRiskOverlay && (
                  <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--destructive))', fontSize: 10 }} unit="%" />
                )}
                <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} />
                <Area yAxisId="left" type="monotone" dataKey="value" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#gradient-vol)" name="Volume" />
                {showHighRiskOverlay && (
                  <Bar yAxisId="right" dataKey="highRiskPct" fill="hsl(var(--destructive))" opacity={0.3} name="High-Risk %" />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="stat-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-4">Live Insights</h3>
          <div className="space-y-3">
            {liveInsights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-md border border-border bg-muted/20">
                <span className={cn(
                  'mt-1 flex-shrink-0 w-2 h-2 rounded-full',
                  insight.severity === 'critical' && 'bg-destructive animate-pulse',
                  insight.severity === 'high' && 'bg-orange-500',
                  insight.severity === 'medium' && 'bg-warning',
                )} />
                <p className="text-xs text-foreground leading-relaxed">{insight.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stat-card">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Live Transaction Stream</h3>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Transaction ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Merchant</th>
                <th>Channel</th>
                <th>Risk Drivers</th>
                <th>Confidence</th>
                <th>Rules Hit</th>
                <th>Risk</th>
                <th>Status</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {transactions.filter(t => feedFilter === 'all' || t.riskLevel === feedFilter).map((txn, index) => {
                const drivers = getRiskDrivers(txn);
                const isSelected = selectedId === txn.id;
                return (
                  <tr
                    key={txn.id}
                    className={cn(
                      'transition-all duration-300 cursor-pointer',
                      index === 0 && isLive && !isSelected && 'bg-primary/5',
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/40'
                    )}
                    onClick={() => handleRowClick(txn.id)}
                    onKeyDown={(e) => handleRowKeyDown(e, txn.id)}
                    tabIndex={0}
                    role="button"
                    aria-selected={isSelected}
                    data-testid={`row-live-txn-${txn.id}`}
                  >
                    <td className="font-mono text-xs text-muted-foreground">{formatTime(txn.timestamp)}</td>
                    <td className="font-mono text-xs">{txn.id}</td>
                    <td className="font-mono text-xs">{txn.customerId}</td>
                    <td className={cn('font-semibold', txn.amount > 5000 && 'text-warning', txn.amount > 10000 && 'text-destructive')}>
                      {formatAmount(txn.amount)}
                    </td>
                    <td className="text-sm">{txn.merchantName}</td>
                    <td><Badge variant="outline" className="text-xs capitalize">{txn.channel}</Badge></td>
                    <td>
                      <div className="flex gap-1 flex-wrap">
                        {drivers.map(d => (
                          <Badge key={d} variant="outline" className="text-[10px] capitalize px-1.5 py-0">{riskDriverLabels[d] || d}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="text-xs font-mono">{(txn.mlProbability * 100).toFixed(0)}%</td>
                    <td className="text-xs font-mono">{txn.rulesTriggered.length}</td>
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
                        data-testid={`button-chevron-live-${txn.id}`}
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

export default LiveMonitoring;
