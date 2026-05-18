import { useMemo } from 'react';
import { Activity, Smartphone, Monitor, CreditCard, Landmark, AlertTriangle, ShieldAlert, ShieldCheck, Shield } from 'lucide-react';
import { RiskScoreBadge } from './RiskScoreBadge';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useTransactionsQuery } from '@/hooks/use-transactions-api';
import { RiskLevel, Channel } from '@/types';
import { cn } from '@/lib/utils';

const countryFlags: Record<string, string> = {
  'United States': 'US',
  'Canada': 'CA',
  'United Kingdom': 'GB',
  'Germany': 'DE',
  'France': 'FR',
  'Japan': 'JP',
  'Nigeria': 'NG',
  'Russia': 'RU',
  'China': 'CN',
  'Brazil': 'BR',
};

const getDeviceIcon = (channel: Channel) => {
  switch (channel) {
    case 'mobile':
      return Smartphone;
    case 'web':
      return Monitor;
    case 'pos':
      return CreditCard;
    case 'atm':
      return Landmark;
    case 'branch':
      return Landmark;
    default:
      return Monitor;
  }
};

const getCustomerRiskLabel = (riskLevel: RiskLevel) => {
  switch (riskLevel) {
    case 'critical':
      return { label: 'Critical', icon: ShieldAlert };
    case 'high':
      return { label: 'High Risk', icon: AlertTriangle };
    case 'medium':
      return { label: 'Med Risk', icon: Shield };
    case 'low':
      return { label: 'Low Risk', icon: ShieldCheck };
  }
};

export const LiveTransactionFeed = () => {
  const { data } = useTransactionsQuery({ limit: 8 }, { refetchInterval: 5000 });
  const transactions = useMemo(() => data ?? [], [data]);

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Live Transaction Feed
        </h3>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
          </span>
          <span className="text-xs text-muted-foreground">Live</span>
        </div>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-hidden">
        {transactions.map((txn, index) => {
          const DeviceIcon = getDeviceIcon(txn.channel);
          const countryCode = countryFlags[txn.geoLocation.country] || txn.geoLocation.country.slice(0, 2).toUpperCase();
          const customerRisk = getCustomerRiskLabel(txn.riskLevel);
          const CustomerRiskIcon = customerRisk.icon;

          return (
            <Tooltip key={txn.id}>
              <TooltipTrigger asChild>
                <div
                  data-testid={`txn-feed-item-${txn.id}`}
                  className={cn(
                    'flex items-center justify-between gap-3 p-3 rounded-md border border-border/50 bg-muted/20 cursor-pointer',
                    'transition-all duration-300',
                    index === 0 && 'animate-slide-up border-primary/30 bg-primary/5'
                  )}
                >
                  <div className="flex items-center gap-2 shrink-0">
                    <DeviceIcon className="h-3.5 w-3.5 text-muted-foreground" data-testid={`txn-device-icon-${txn.id}`} />
                    <span className="text-xs font-medium text-muted-foreground w-6 text-center" data-testid={`txn-geo-flag-${txn.id}`}>
                      {countryCode}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">{formatTime(txn.timestamp)}</span>
                      <span className={cn(
                        'font-semibold',
                        txn.riskLevel === 'critical' && 'text-destructive',
                        txn.riskLevel === 'high' && 'text-orange-400',
                        txn.riskLevel === 'medium' && 'text-warning',
                        txn.riskLevel === 'low' && 'text-foreground'
                      )}>
                        {formatAmount(txn.amount)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {txn.merchantName} — {txn.geoLocation.city}, {txn.geoLocation.country}
                    </p>
                  </div>

                  <div className="ml-2 flex items-center gap-2 shrink-0 flex-wrap">
                    <Badge
                      variant={txn.riskLevel === 'critical' || txn.riskLevel === 'high' ? 'destructive' : 'secondary'}
                      className="text-[10px] no-default-active-elevate"
                      data-testid={`txn-risk-badge-${txn.id}`}
                    >
                      <CustomerRiskIcon className="h-3 w-3 mr-1" />
                      {customerRisk.label}
                    </Badge>
                    <RiskScoreBadge score={txn.riskScore} level={txn.riskLevel} size="sm" />
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-xs">
                <div className="space-y-2 py-1" data-testid={`txn-tooltip-${txn.id}`}>
                  <div className="font-medium text-sm">{txn.id}</div>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Channel</span>
                      <span className="capitalize">{txn.channel}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Device</span>
                      <span className="font-mono text-[10px]">{txn.deviceId.slice(0, 12)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">IP</span>
                      <span className="font-mono text-[10px]">{txn.ipAddress}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">ML Score</span>
                      <span>{(txn.mlProbability * 100).toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-muted-foreground">Anomaly</span>
                      <span>{(txn.anomalyScore * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                  {txn.rulesTriggered.length > 0 && (
                    <div className="border-t border-border pt-1.5">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Risk Factors</div>
                      <ul className="text-xs space-y-0.5">
                        {txn.rulesTriggered.slice(0, 3).map((rule, i) => (
                          <li key={i} className="flex items-start gap-1">
                            <AlertTriangle className="h-3 w-3 text-warning shrink-0 mt-0.5" />
                            <span>{rule}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};
