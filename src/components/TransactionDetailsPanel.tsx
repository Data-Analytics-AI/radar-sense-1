import { Transaction } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RiskScoreBadge } from '@/components/dashboard/RiskScoreBadge';
import {
  Briefcase, AlertTriangle, MapPin, Smartphone, Globe,
  CreditCard, Clock, Hash, User, ShoppingBag, ChevronDown,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  addAlertToCache, addCaseToCache, buildAlertFromTransaction, buildCaseFromTransaction,
} from '@/lib/mock-data';

interface TransactionDetailsPanelProps {
  transaction: Transaction;
}

function DetailRow({ label, value, icon: Icon, mono = false }: {
  label: string;
  value: React.ReactNode;
  icon?: React.ElementType;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2 py-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
        {Icon && <Icon className="h-3.5 w-3.5 flex-shrink-0" />}
        <span>{label}</span>
      </div>
      <span className={cn('text-sm text-right', mono && 'font-mono text-xs')}>{value}</span>
    </div>
  );
}

export function TransactionDetailsPanel({ transaction: txn }: TransactionDetailsPanelProps) {
  const [showPayload, setShowPayload] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [createAlertOpen, setCreateAlertOpen] = useState(false);
  const [alertSeverity, setAlertSeverity] = useState<'low' | 'medium' | 'high' | 'critical'>(
    txn.riskLevel === 'low' ? 'medium' : txn.riskLevel,
  );
  const [alertReason, setAlertReason] = useState('');

  const [openCaseDialog, setOpenCaseDialog] = useState(false);
  const [casePriority, setCasePriority] = useState<'low' | 'medium' | 'high' | 'critical'>(
    txn.riskLevel === 'low' ? 'medium' : txn.riskLevel,
  );

  const handleCreateAlert = () => {
    const newAlert = buildAlertFromTransaction(txn, {
      severity: alertSeverity,
      description: alertReason.trim()
        ? `Manual alert: ${alertReason.trim()} (txn ${txn.id})`
        : `Manually-created alert from transaction ${txn.id}: ${txn.description}`,
    });
    addAlertToCache(newAlert);
    toast({
      title: 'Alert created',
      description: `${newAlert.id} created for transaction ${txn.id}. Opening alert queue…`,
    });
    setAlertReason('');
    setCreateAlertOpen(false);
    setTimeout(() => navigate(`/alerts?selected=${newAlert.id}`), 400);
  };

  const handleOpenCase = () => {
    const newCase = buildCaseFromTransaction(txn, { priority: casePriority });
    addCaseToCache(newCase);
    toast({
      title: 'Case opened',
      description: `${newCase.id} created for transaction ${txn.id}. Opening case workspace…`,
    });
    setOpenCaseDialog(false);
    setTimeout(() => navigate(`/cases/${newCase.id}`), 400);
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(amount);

  return (
    <div className="space-y-5" data-testid="transaction-details-panel">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Transaction Summary</h3>
        <DetailRow label="Transaction ID" value={txn.id} icon={Hash} mono />
        <DetailRow label="Date / Time" value={format(new Date(txn.timestamp), 'MMM d, yyyy HH:mm:ss')} icon={Clock} />
        <DetailRow label="Channel" value={<Badge variant="outline" className="text-xs capitalize">{txn.channel}</Badge>} />
        <DetailRow label="Type" value={<span className="capitalize">{txn.type.replace('_', ' ')}</span>} />
        <DetailRow
          label="Amount"
          value={
            <span className={cn('font-semibold', txn.amount > 5000 && 'text-warning', txn.amount > 10000 && 'text-destructive')}>
              {formatAmount(txn.amount)}
            </span>
          }
        />
        <DetailRow label="Currency" value={txn.currency} />
        <DetailRow
          label="Status"
          value={
            <Badge variant="outline" className={cn('text-xs capitalize',
              txn.status === 'completed' && 'border-success/30 text-success',
              txn.status === 'pending' && 'border-warning/30 text-warning',
              txn.status === 'declined' && 'border-destructive/30 text-destructive'
            )}>{txn.status}</Badge>
          }
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Customer</h3>
        <DetailRow label="Customer ID" value={txn.customerId} icon={User} mono />
        <DetailRow label="Account ID" value={txn.accountId} mono />
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Merchant</h3>
        <DetailRow label="Merchant" value={txn.merchantName} icon={ShoppingBag} />
        <DetailRow label="MCC" value={txn.merchantCategoryCode} mono />
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Risk Assessment</h3>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-xs text-muted-foreground">Risk Score</span>
          <RiskScoreBadge score={txn.riskScore} level={txn.riskLevel} size="sm" />
        </div>
        <DetailRow label="ML Confidence" value={`${(txn.mlProbability * 100).toFixed(1)}%`} />
        <DetailRow label="Anomaly Score" value={txn.anomalyScore.toFixed(3)} />
      </div>

      {txn.rulesTriggered.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Risk Drivers ({txn.rulesTriggered.length})
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {txn.rulesTriggered.map((rule, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1 text-warning" />
                  {rule}
                </Badge>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Geo / Device / IP</h3>
        <DetailRow label="Location" value={`${txn.geoLocation.city}, ${txn.geoLocation.country}`} icon={MapPin} />
        <DetailRow label="Coordinates" value={`${txn.geoLocation.latitude}, ${txn.geoLocation.longitude}`} icon={Globe} mono />
        <DetailRow label="Device ID" value={txn.deviceId} icon={Smartphone} mono />
        <DetailRow label="IP Address" value={txn.ipAddress} mono />
        <DetailRow label="Card" value={txn.cardNumberMasked} icon={CreditCard} mono />
      </div>

      <Separator />

      <div className="space-y-3">
        <button
          onClick={() => setShowPayload(!showPayload)}
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground uppercase tracking-wider w-full text-left"
          data-testid="button-toggle-payload"
        >
          Raw Payload
          <ChevronDown className={cn('h-4 w-4 transition-transform', showPayload && 'rotate-180')} />
        </button>
        {showPayload && (
          <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-auto max-h-[300px] border border-border font-mono">
            {JSON.stringify(txn, null, 2)}
          </pre>
        )}
      </div>

      <Separator />

      <div className="flex gap-2 pb-4">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => setCreateAlertOpen(true)}
          data-testid="button-create-alert"
        >
          <AlertTriangle className="h-4 w-4 mr-2" />
          Create Alert
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => setOpenCaseDialog(true)}
          data-testid="button-open-case"
        >
          <Briefcase className="h-4 w-4 mr-2" />
          Open Case
        </Button>
      </div>

      <Dialog open={createAlertOpen} onOpenChange={setCreateAlertOpen}>
        <DialogContent data-testid="dialog-create-alert">
          <DialogHeader>
            <DialogTitle>Create Alert from {txn.id}</DialogTitle>
            <DialogDescription>Flag this transaction for analyst review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={alertSeverity} onValueChange={(v) => setAlertSeverity(v as typeof alertSeverity)}>
                <SelectTrigger data-testid="select-alert-severity"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                value={alertReason}
                onChange={(e) => setAlertReason(e.target.value)}
                placeholder="Why is this transaction suspicious?"
                rows={3}
                data-testid="textarea-alert-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateAlertOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAlert} data-testid="button-confirm-create-alert">Create Alert</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openCaseDialog} onOpenChange={setOpenCaseDialog}>
        <DialogContent data-testid="dialog-open-case">
          <DialogHeader>
            <DialogTitle>Open Case for {txn.id}</DialogTitle>
            <DialogDescription>A new investigation case will be created and linked to this transaction.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Priority</Label>
            <Select value={casePriority} onValueChange={(v) => setCasePriority(v as typeof casePriority)}>
              <SelectTrigger data-testid="select-case-priority"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenCaseDialog(false)}>Cancel</Button>
            <Button onClick={handleOpenCase} data-testid="button-confirm-open-case">Open Case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
