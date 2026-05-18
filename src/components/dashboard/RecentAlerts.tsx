import { useMemo, useState, useEffect } from 'react';
import { AlertTriangle, ChevronRight, Clock, UserCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { RiskScoreBadge } from './RiskScoreBadge';
import { AlertStatusBadge } from './AlertStatusBadge';
import { generateTransactions, generateAlerts } from '@/lib/mock-data';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Alert, RiskLevel } from '@/types';

const PRIORITY_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SLA_HOURS: Record<RiskLevel, number> = {
  critical: 1,
  high: 4,
  medium: 24,
  low: 72,
};

const INVESTIGATORS = [
  'Sarah Chen',
  'Michael Torres',
  'Emily Watson',
  'James Kim',
  'Priya Patel',
];

function getSuggestedInvestigator(alert: Alert): string {
  const hash = alert.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return INVESTIGATORS[hash % INVESTIGATORS.length];
}

function getSlaDeadline(alert: Alert): Date {
  const created = new Date(alert.createdAt);
  const slaMs = SLA_HOURS[alert.severity] * 60 * 60 * 1000;
  return new Date(created.getTime() + slaMs);
}

function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Overdue';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function SlaTimer({ alert }: { alert: Alert }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  if (alert.status === 'closed') {
    return (
      <Badge variant="secondary" className="text-[10px] no-default-hover-elevate no-default-active-elevate">
        <Clock className="h-3 w-3 mr-1" />
        Resolved
      </Badge>
    );
  }

  const deadline = getSlaDeadline(alert);
  const remaining = deadline.getTime() - now;
  const isOverdue = remaining <= 0;
  const isUrgent = remaining > 0 && remaining < 30 * 60 * 1000;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          data-testid={`sla-timer-${alert.id}`}
          className="inline-flex"
        >
          <Badge
            variant="secondary"
            className={cn(
              'text-[10px] no-default-hover-elevate no-default-active-elevate',
              isOverdue && 'bg-destructive/20 text-destructive border-destructive/30',
              isUrgent && !isOverdue && 'bg-warning/20 text-warning border-warning/30'
            )}
          >
            <Clock className={cn('h-3 w-3 mr-1', isOverdue && 'animate-pulse')} />
            {formatTimeRemaining(remaining)}
          </Badge>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p>SLA: {SLA_HOURS[alert.severity]}h for {alert.severity} severity</p>
        <p>{isOverdue ? 'SLA breached' : `Due: ${deadline.toLocaleTimeString()}`}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export const RecentAlerts = () => {
  const alerts = useMemo(() => {
    const transactions = generateTransactions(50);
    const allAlerts = generateAlerts(transactions).slice(0, 8);
    return allAlerts.sort((a, b) => {
      const priorityDiff = PRIORITY_ORDER[a.severity] - PRIORITY_ORDER[b.severity];
      if (priorityDiff !== 0) return priorityDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, []);

  return (
    <div className="stat-card" data-testid="recent-alerts-panel">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Recent Alerts
        </h3>
        <Link to="/alerts">
          <Button variant="ghost" size="sm" className="text-xs" data-testid="link-view-all-alerts">
            View all
            <ChevronRight className="h-3 w-3 ml-1" />
          </Button>
        </Link>
      </div>

      <div className="space-y-3">
        {alerts.map((alert) => {
          const investigator = getSuggestedInvestigator(alert);
          return (
            <Link
              key={alert.id}
              to={`/alerts/${alert.id}`}
              className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/30 hover-elevate transition-colors group"
              data-testid={`alert-row-${alert.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-mono text-sm text-foreground" data-testid={`text-alert-id-${alert.id}`}>
                    {alert.id}
                  </span>
                  <AlertStatusBadge status={alert.status} />
                  <SlaTimer alert={alert} />
                </div>
                <p className="text-xs text-muted-foreground truncate" data-testid={`text-alert-desc-${alert.id}`}>
                  {alert.description}
                </p>
                <div className="flex items-center gap-3 flex-wrap mt-1">
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                  </p>
                  {!alert.assignedTo && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground cursor-default" data-testid={`text-suggested-investigator-${alert.id}`}>
                          <UserCheck className="h-3 w-3" />
                          {investigator}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Suggested investigator based on workload</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {alert.assignedTo && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-foreground/70" data-testid={`text-assigned-to-${alert.id}`}>
                      <UserCheck className="h-3 w-3" />
                      {alert.assignedTo}
                    </span>
                  )}
                </div>
              </div>
              <div className="ml-2 shrink-0">
                <RiskScoreBadge score={alert.riskScore} level={alert.severity} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
