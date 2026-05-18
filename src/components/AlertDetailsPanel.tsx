import { useState } from 'react';
import { Alert } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RiskScoreBadge } from '@/components/dashboard/RiskScoreBadge';
import { AlertStatusBadge } from '@/components/dashboard/AlertStatusBadge';
import {
  Briefcase, AlertTriangle, Clock, Hash, User,
  UserPlus, ArrowUpRight, MessageSquare, FileText, Shield, ShieldAlert, ExternalLink,
  Sparkles, Loader2,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { getCustomerById, getScreeningMatches } from '@/lib/compliance-data';
import { analyzeWithAI } from '@/lib/ai';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  usePatchAlert, useAddAlertNote, useCreateCase,
} from '@/hooks/use-alerts-cases-api';
import type { Case } from '@/types';

interface AlertNoteRecord { author: string; text: string; ts: string }

const ANALYSTS = ['analyst-1', 'analyst-2', 'analyst-3', 'analyst-4', 'analyst-5'];

const COMPLIANCE_ALERT_TYPES = ['kyc_risk', 'pep_match', 'sanction', 'edd_required'] as const;
type ComplianceAlertType = typeof COMPLIANCE_ALERT_TYPES[number];
const isComplianceAlert = (t: Alert['type']): t is ComplianceAlertType =>
  (COMPLIANCE_ALERT_TYPES as readonly string[]).includes(t);

const RECOMMENDED_ACTION: Record<ComplianceAlertType, string> = {
  kyc_risk: 'Re-screen customer / Request additional KYC documents',
  pep_match: 'Open EDD Case for enhanced review',
  sanction: 'Block account and Submit STR to NFIU',
  edd_required: 'Open EDD Case and gather source-of-wealth evidence',
};

interface AlertDetailsPanelProps {
  alert: Alert;
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

export function AlertDetailsPanel({ alert }: AlertDetailsPanelProps) {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canManageAlerts = can('manage_alerts');
  const canCreateCase = can('create_cases');
  const navigate = useNavigate();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string>('');

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>(alert.assignedTo || ANALYSTS[0]);

  const [escalateOpen, setEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  const patchAlert = usePatchAlert();
  const addAlertNote = useAddAlertNote();
  const createCase = useCreateCase();

  // The `notes` jsonb column is appended to via POST /api/alerts/:id/notes; the
  // server owns its shape so we accept `unknown[]` and validate each record at
  // render time.
  const localNotes: AlertNoteRecord[] = ((alert as Alert & { notes?: unknown[] }).notes ?? [])
    .filter((n): n is AlertNoteRecord =>
      typeof n === 'object' && n !== null
      && typeof (n as { author?: unknown }).author === 'string'
      && typeof (n as { text?: unknown }).text === 'string'
      && typeof (n as { ts?: unknown }).ts === 'string');

  const [createCaseOpen, setCreateCaseOpen] = useState(false);
  const [casePriority, setCasePriority] = useState<'low' | 'medium' | 'high' | 'critical'>(alert.severity);
  const [caseAssignee, setCaseAssignee] = useState<string>(alert.assignedTo || ANALYSTS[0]);

  const handleAssign = () => {
    patchAlert.mutate(
      { id: alert.id, patch: { assignedTo: assignee, status: alert.status === 'open' ? 'under_investigation' : alert.status } },
      {
        onSuccess: () => toast({ title: 'Alert assigned', description: `${alert.id} assigned to ${assignee}.` }),
        onError: (e) => toast({ title: 'Assign failed', description: e.message, variant: 'destructive' }),
      },
    );
    setAssignOpen(false);
  };

  const handleEscalate = () => {
    patchAlert.mutate(
      { id: alert.id, patch: { status: 'escalated' } },
      {
        onSuccess: () => toast({
          title: 'Alert escalated',
          description: escalateReason ? `Reason: ${escalateReason}` : `${alert.id} marked as escalated.`,
        }),
        onError: (e) => toast({ title: 'Escalate failed', description: e.message, variant: 'destructive' }),
      },
    );
    setEscalateReason('');
    setEscalateOpen(false);
  };

  const handleAddNote = () => {
    const text = noteText.trim();
    if (!text) {
      toast({ title: 'Note is empty', variant: 'destructive' });
      return;
    }
    addAlertNote.mutate(
      { id: alert.id, note: { author: 'You', text, ts: new Date().toISOString() } },
      {
        onSuccess: () => toast({ title: 'Note added', description: `Note attached to ${alert.id}.` }),
        onError: (e) => toast({ title: 'Add note failed', description: e.message, variant: 'destructive' }),
      },
    );
    setNoteText('');
    setNoteOpen(false);
  };

  const handleCreateCase = () => {
    const caseId = `CASE-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const newCase: Case = {
      id: caseId,
      type: alert.type === 'aml' || alert.type === 'sanction' ? 'aml' : alert.type === 'fraud' ? 'fraud' : 'mixed',
      alertIds: [alert.id],
      transactionIds: alert.transactionId ? [alert.transactionId] : [],
      customerId: alert.customerId,
      assignedTo: caseAssignee,
      priority: casePriority,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      tags: [alert.type, alert.severity],
      notes: [],
      timeline: [{
        id: `tl-${caseId}-1`,
        type: 'alert_triggered',
        title: 'Alert Triggered',
        description: `Case opened from alert ${alert.id}`,
        performedBy: 'You',
        timestamp: now,
      }],
      linkedEntities: [],
      evidence: [],
      description: `Investigation opened from alert ${alert.id}: ${alert.description}`,
    };
    createCase.mutate(newCase, {
      onSuccess: () => {
        patchAlert.mutate({ id: alert.id, patch: { status: 'under_investigation' } });
        toast({ title: 'Case created', description: `${caseId} created from ${alert.id}. Opening case workspace…` });
        setCreateCaseOpen(false);
        setTimeout(() => navigate(`/cases/${caseId}`), 400);
      },
      onError: (e) => toast({ title: 'Case creation failed', description: e.message, variant: 'destructive' }),
    });
  };

  const handleExplainAi = async () => {
    setAiLoading(true);
    setAiResult('');
    try {
      const result = await analyzeWithAI('fraud_explain', {
        alert: {
          id: alert.id,
          type: alert.type,
          severity: alert.severity,
          status: alert.status,
          riskScore: alert.riskScore,
          description: alert.description,
          contributingFactors: alert.contributingFactors,
          ruleIds: alert.ruleIds,
          modelVersion: alert.modelVersion,
          customerId: alert.customerId,
          transactionId: alert.transactionId,
          createdAt: alert.createdAt,
        },
      });
      setAiResult(result);
    } catch (err) {
      toast({
        title: 'AI generation failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setAiLoading(false);
    }
  };

  const showCompliance = isComplianceAlert(alert.type);
  const customer = showCompliance ? getCustomerById(alert.customerId) : undefined;
  const customerName = customer
    ? customer.type === 'individual' ? customer.fullName : customer.companyName
    : undefined;
  const screeningMatch = showCompliance && (alert.type === 'pep_match' || alert.type === 'sanction')
    ? getScreeningMatches().find(
        (s) => s.customerId === alert.customerId &&
          ((alert.type === 'pep_match' && s.screeningType === 'pep') ||
           (alert.type === 'sanction' && s.screeningType === 'sanction'))
      )
    : undefined;
  return (
    <div className="space-y-5" data-testid="alert-details-panel">
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Alert Summary</h3>
        <DetailRow label="Alert ID" value={alert.id} icon={Hash} mono />
        <DetailRow
          label="Type"
          value={<Badge variant="outline" className="text-xs capitalize">{alert.type}</Badge>}
        />
        <div className="flex items-start justify-between gap-2 py-1.5">
          <span className="text-xs text-muted-foreground">Severity</span>
          <RiskScoreBadge score={alert.riskScore} level={alert.severity} size="sm" />
        </div>
        <div className="flex items-start justify-between gap-2 py-1.5">
          <span className="text-xs text-muted-foreground">Status</span>
          <AlertStatusBadge status={alert.status} />
        </div>
        <DetailRow
          label="Created"
          value={format(new Date(alert.createdAt), 'MMM d, yyyy HH:mm:ss')}
          icon={Clock}
        />
        <DetailRow
          label="Updated"
          value={formatDistanceToNow(new Date(alert.updatedAt), { addSuffix: true })}
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Description</h3>
        <p className="text-sm text-foreground">{alert.description}</p>
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Linked Entities</h3>
        <DetailRow label="Transaction ID" value={alert.transactionId} icon={FileText} mono />
        <DetailRow label="Customer ID" value={alert.customerId} icon={User} mono />
        <DetailRow label="Model Version" value={alert.modelVersion} mono />
        {alert.ruleIds.length > 0 && (
          <div className="py-1.5">
            <span className="text-xs text-muted-foreground block mb-1">Rules Triggered</span>
            <div className="flex flex-wrap gap-1">
              {alert.ruleIds.map((ruleId) => (
                <Badge key={ruleId} variant="outline" className="text-xs font-mono">{ruleId}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {alert.contributingFactors.length > 0 && (
        <>
          <Separator />
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Contributing Factors ({alert.contributingFactors.length})
            </h3>
            <div className="space-y-1.5">
              {alert.contributingFactors.map((factor, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
                  <span>{factor}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Investigation Timeline</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">Alert Created</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(alert.createdAt), 'MMM d, yyyy HH:mm')}
              </p>
            </div>
          </div>
          {alert.assignedTo && (
            <div className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-warning mt-1.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Assigned to {alert.assignedTo}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(alert.updatedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          )}
          {alert.status !== 'open' && (
            <div className="flex items-start gap-3">
              <div className={cn(
                'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                alert.status === 'under_investigation' && 'bg-warning',
                alert.status === 'escalated' && 'bg-orange-500',
                alert.status === 'closed' && 'bg-muted-foreground',
              )} />
              <div>
                <p className="text-sm font-medium capitalize">
                  Status: {alert.status.replace('_', ' ')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(alert.updatedAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {showCompliance && (
        <>
          <Separator />
          <div className="space-y-3" data-testid="section-compliance-context">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="h-4 w-4" />
              Compliance Context
            </h3>
            <div className="space-y-2">
              <div className="flex items-start justify-between gap-2 py-1.5">
                <span className="text-xs text-muted-foreground">Customer</span>
                {customer ? (
                  <Link
                    to="/onboarding"
                    className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    data-testid="link-compliance-customer"
                  >
                    {customerName} <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : (
                  <span className="text-sm font-mono text-xs">{alert.customerId}</span>
                )}
              </div>
              {customer && (
                <>
                  <DetailRow
                    label="KYC Status"
                    value={<Badge variant="outline" className="text-xs capitalize">{customer.kycStatus}</Badge>}
                  />
                  <DetailRow
                    label="Risk Level"
                    value={<Badge variant="outline" className="text-xs capitalize">{customer.riskLevel}</Badge>}
                  />
                </>
              )}
              {screeningMatch && (
                <div className="rounded-md border border-border p-3 space-y-1.5 mt-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Shield className="h-3.5 w-3.5" />
                    Screening Match
                  </div>
                  <DetailRow label="Matched Name" value={screeningMatch.matchedName} />
                  <DetailRow label="List Source" value={screeningMatch.matchedListSource} />
                  <DetailRow label="Confidence" value={`${screeningMatch.confidence}%`} />
                  <DetailRow label="Jurisdiction" value={screeningMatch.jurisdiction} />
                  {screeningMatch.positionOrRole && (
                    <DetailRow label="Position" value={screeningMatch.positionOrRole} />
                  )}
                </div>
              )}
              <div className="rounded-md border border-border bg-muted/30 p-3 mt-2">
                <p className="text-xs text-muted-foreground mb-1">Recommended Action</p>
                <p className="text-sm font-medium">{RECOMMENDED_ACTION[alert.type as ComplianceAlertType]}</p>
              </div>
            </div>
          </div>
        </>
      )}

      <Separator />

      <div className="flex flex-wrap gap-2">
        {canManageAlerts && (
          <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)} data-testid="button-assign-alert">
            <UserPlus className="h-4 w-4 mr-2" />
            Assign
          </Button>
        )}
        {canManageAlerts && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEscalateOpen(true)}
            disabled={alert.status === 'escalated' || alert.status === 'closed'}
            data-testid="button-escalate-alert"
          >
            <ArrowUpRight className="h-4 w-4 mr-2" />
            Escalate
          </Button>
        )}
        {canCreateCase && (
          <Button size="sm" variant="outline" onClick={() => setCreateCaseOpen(true)} data-testid="button-create-case-from-alert">
            <Briefcase className="h-4 w-4 mr-2" />
            Create Case
          </Button>
        )}
        {canManageAlerts && (
          <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)} data-testid="button-add-note">
            <MessageSquare className="h-4 w-4 mr-2" />
            Add Note
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={handleExplainAi} disabled={aiLoading} data-testid="button-explain-ai">
          {aiLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Explain with AI
        </Button>
      </div>

      {localNotes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes ({localNotes.length})</h4>
          <div className="space-y-2">
            {localNotes.map((n, i) => (
              <div key={i} className="rounded-md border border-border bg-muted/30 p-3" data-testid={`note-${i}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{n.author}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(n.ts), 'MMM d, HH:mm')}</span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{n.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent data-testid="dialog-assign-alert">
          <DialogHeader>
            <DialogTitle>Assign Alert {alert.id}</DialogTitle>
            <DialogDescription>Choose an analyst to take ownership of this alert.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Analyst</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger data-testid="select-assignee"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANALYSTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} data-testid="button-confirm-assign">Assign</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
        <DialogContent data-testid="dialog-escalate-alert">
          <DialogHeader>
            <DialogTitle>Escalate Alert {alert.id}</DialogTitle>
            <DialogDescription>Mark this alert as escalated and notify L2 review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason (optional)</Label>
            <Textarea
              value={escalateReason}
              onChange={e => setEscalateReason(e.target.value)}
              placeholder="Why are you escalating?"
              data-testid="textarea-escalate-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEscalateOpen(false)}>Cancel</Button>
            <Button onClick={handleEscalate} data-testid="button-confirm-escalate">Escalate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent data-testid="dialog-add-note">
          <DialogHeader>
            <DialogTitle>Add Note to {alert.id}</DialogTitle>
            <DialogDescription>Notes are visible to investigators reviewing this alert.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Type your note…"
              rows={5}
              data-testid="textarea-note"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button onClick={handleAddNote} data-testid="button-confirm-note">Add Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createCaseOpen} onOpenChange={setCreateCaseOpen}>
        <DialogContent data-testid="dialog-create-case">
          <DialogHeader>
            <DialogTitle>Create Case from {alert.id}</DialogTitle>
            <DialogDescription>A new case will be opened and linked to this alert.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select value={caseAssignee} onValueChange={setCaseAssignee}>
                <SelectTrigger data-testid="select-case-assignee"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANALYSTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateCaseOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateCase} data-testid="button-confirm-create-case">Create Case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {(aiLoading || aiResult) && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 mb-4" data-testid="ai-explain-result">
          <div className="flex items-center gap-2 text-xs font-semibold mb-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI Explanation
          </div>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{aiResult}</div>
          )}
        </div>
      )}
    </div>
  );
}
