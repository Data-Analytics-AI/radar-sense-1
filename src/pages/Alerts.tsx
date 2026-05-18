import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Search,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { RiskScoreBadge } from '@/components/dashboard/RiskScoreBadge';
import { AlertStatusBadge } from '@/components/dashboard/AlertStatusBadge';
import { useAlertsQuery } from '@/hooks/use-alerts-cases-api';
import { Alert, AlertStatus } from '@/types';

type AlertTypeFilter = 'all' | Alert['type'] | 'compliance';

const COMPLIANCE_TYPES: Alert['type'][] = ['kyc_risk', 'pep_match', 'sanction', 'edd_required'];

const TYPE_BADGE: Record<Alert['type'], { label: string; className: string }> = {
  fraud: { label: 'Fraud', className: '' },
  aml: { label: 'AML', className: '' },
  graph: { label: 'Graph', className: '' },
  rule: { label: 'Rule', className: '' },
  model: { label: 'Model', className: '' },
  kyc_risk: { label: 'KYC Risk', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30' },
  pep_match: { label: 'PEP Match', className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30' },
  sanction: { label: 'Sanction', className: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30' },
  edd_required: { label: 'EDD Required', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
};
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useDetailsSelection } from '@/hooks/useDetailsSelection';
import { DetailsDrawer } from '@/components/DetailsDrawer';
import { AlertDetailsPanel } from '@/components/AlertDetailsPanel';

const Alerts = () => {
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<AlertTypeFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { selectedId, isOpen, select, deselect } = useDetailsSelection('selected');

  const { data: alertsData = [], isLoading } = useAlertsQuery();
  const alerts = useMemo(
    () => [...alertsData].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [alertsData],
  );

  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      const matchesStatus = statusFilter === 'all' || alert.status === statusFilter;
      const matchesType = typeFilter === 'all'
        || (typeFilter === 'compliance' ? COMPLIANCE_TYPES.includes(alert.type) : alert.type === typeFilter);
      const matchesSearch = searchQuery === '' || 
        alert.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.transactionId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        alert.customerId.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesType && matchesSearch;
    });
  }, [alerts, statusFilter, typeFilter, searchQuery]);

  const selectedAlert = useMemo(() => {
    if (!selectedId) return null;
    return alerts.find(a => a.id === selectedId) || null;
  }, [selectedId, alerts]);
  
  const statusCounts = useMemo(() => {
    return {
      all: alerts.length,
      open: alerts.filter(a => a.status === 'open').length,
      under_investigation: alerts.filter(a => a.status === 'under_investigation').length,
      escalated: alerts.filter(a => a.status === 'escalated').length,
      closed: alerts.filter(a => a.status === 'closed').length,
    };
  }, [alerts]);

  const handleRowClick = (alertId: string) => {
    select(alertId);
  };

  const handleChevronClick = (e: React.MouseEvent, alertId: string) => {
    e.stopPropagation();
    select(alertId);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, alertId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(alertId);
    }
  };
  
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-warning" />
            Alert Management
          </h1>
          <p className="text-muted-foreground">Review and manage fraud and AML alerts</p>
        </div>
      </div>
      
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-4">
        {(['all', 'open', 'under_investigation', 'escalated', 'closed'] as const).map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className="capitalize"
            data-testid={`button-status-${status}`}
          >
            {status.replace('_', ' ')}
            <Badge 
              variant="secondary" 
              className={cn(
                'ml-2',
                statusFilter === status && 'bg-primary-foreground/20'
              )}
            >
              {statusCounts[status]}
            </Badge>
          </Button>
        ))}
        <div className="mx-2 h-6 w-px bg-border" />
        <Button
          variant={typeFilter === 'compliance' ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setTypeFilter(typeFilter === 'compliance' ? 'all' : 'compliance')}
          data-testid="button-filter-compliance"
        >
          Compliance
          <Badge variant="secondary" className={cn('ml-2', typeFilter === 'compliance' && 'bg-primary-foreground/20')}>
            {alerts.filter(a => COMPLIANCE_TYPES.includes(a.type)).length}
          </Badge>
        </Button>
        {COMPLIANCE_TYPES.map((t) => (
          <Button
            key={t}
            variant={typeFilter === t ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}
            data-testid={`button-filter-type-${t}`}
          >
            {TYPE_BADGE[t].label}
          </Button>
        ))}
      </div>
      
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search alerts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-alerts"
          />
        </div>
        <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as AlertTypeFilter)}>
          <SelectTrigger className="w-[200px]" data-testid="select-alert-type">
            <SelectValue placeholder="Alert Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="fraud">Fraud</SelectItem>
            <SelectItem value="aml">AML</SelectItem>
            <SelectItem value="graph">Graph/Network</SelectItem>
            <SelectItem value="rule">Rule Violation</SelectItem>
            <SelectItem value="model">Model</SelectItem>
            <SelectItem value="kyc_risk">KYC Risk</SelectItem>
            <SelectItem value="pep_match">PEP Match</SelectItem>
            <SelectItem value="sanction">Sanction</SelectItem>
            <SelectItem value="edd_required">EDD Required</SelectItem>
          </SelectContent>
        </Select>
        <Select defaultValue="all">
          <SelectTrigger className="w-[180px]" data-testid="select-severity">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="stat-card">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Alert ID</th>
                <th>Type</th>
                <th>Description</th>
                <th>Customer</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Assigned To</th>
                <th>Created</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredAlerts.map((alert) => {
                const isSelected = selectedId === alert.id;
                return (
                  <tr
                    key={alert.id}
                    className={cn(
                      'cursor-pointer transition-colors',
                      isSelected ? 'bg-primary/10' : 'hover:bg-muted/40'
                    )}
                    onClick={() => handleRowClick(alert.id)}
                    onKeyDown={(e) => handleRowKeyDown(e, alert.id)}
                    tabIndex={0}
                    role="button"
                    aria-selected={isSelected}
                    data-testid={`row-alert-${alert.id}`}
                  >
                    <td className="font-mono text-sm">{alert.id}</td>
                    <td>
                      <Badge variant="outline" className={cn('text-xs', TYPE_BADGE[alert.type]?.className)}>
                        {TYPE_BADGE[alert.type]?.label ?? alert.type}
                      </Badge>
                    </td>
                    <td className="max-w-[300px]">
                      <p className="text-sm truncate">{alert.description}</p>
                      {alert.contributingFactors.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {alert.contributingFactors.length} contributing factors
                        </p>
                      )}
                    </td>
                    <td className="font-mono text-xs">{alert.customerId}</td>
                    <td>
                      <RiskScoreBadge score={alert.riskScore} level={alert.severity} size="sm" />
                    </td>
                    <td>
                      <AlertStatusBadge status={alert.status} />
                    </td>
                    <td className="text-sm">
                      {alert.assignedTo ? (
                        <span className="text-foreground">{alert.assignedTo}</span>
                      ) : (
                        <span className="text-muted-foreground">Unassigned</span>
                      )}
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                    </td>
                    <td>
                      <button
                        onClick={(e) => handleChevronClick(e, alert.id)}
                        className="p-1 rounded-md hover:bg-muted transition-colors"
                        aria-expanded={isSelected}
                        aria-label={`View details for ${alert.id}`}
                        data-testid={`button-chevron-alert-${alert.id}`}
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
        
        {filteredAlerts.length === 0 && (
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              {isLoading ? 'Loading alerts…' : 'No alerts found matching your criteria'}
            </p>
          </div>
        )}
      </div>

      <DetailsDrawer
        open={isOpen && selectedAlert !== null}
        onOpenChange={(open) => { if (!open) deselect(); }}
        title={selectedAlert ? selectedAlert.id : ''}
        description="Alert Details"
      >
        {selectedAlert && <AlertDetailsPanel alert={selectedAlert} />}
      </DetailsDrawer>
    </div>
  );
};

export default Alerts;
