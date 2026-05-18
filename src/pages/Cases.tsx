import { useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Briefcase, 
  Search, 
  Plus,
  Calendar,
  User,
  Tag,
  ChevronRight,
  Clock,
  AlertTriangle,
  Shield,
  CheckCircle2,
  X,
  FileText,
  Bot,
  ArrowUpRight,
  Timer
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { RiskScoreBadge } from '@/components/dashboard/RiskScoreBadge';
import { NewCaseDialog, NewCaseData } from '@/components/cases/NewCaseDialog';
import { useCasesQuery, useCreateCase } from '@/hooks/use-alerts-cases-api';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Case, CaseStatus, RiskLevel } from '@/types';
import { formatDistanceToNow, differenceInDays, differenceInHours } from 'date-fns';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip
} from 'recharts';

const Cases = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'all'>('all');
  const [isNewCaseOpen, setIsNewCaseOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const { toast } = useToast();
  const { can } = usePermissions();
  const canCreateCase = can('create_cases');

  const { data: casesData = [], isLoading } = useCasesQuery();
  const createCase = useCreateCase();

  const cases = useMemo(
    () => [...casesData].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [casesData],
  );

  const handleCaseCreated = useCallback((data: NewCaseData) => {
    const caseId = `CASE-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date().toISOString();
    const newCase: Case = {
      id: caseId,
      type: data.type,
      alertIds: [],
      transactionIds: [],
      customerId: data.customerId,
      assignedTo: undefined,
      priority: data.priority as RiskLevel,
      status: 'open',
      createdAt: now,
      updatedAt: now,
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      tags: data.tags,
      notes: [],
      timeline: [{ id: `tl-${caseId}-1`, type: 'case_created', title: 'Case Created', description: 'Manual case creation', performedBy: 'John Doe', timestamp: now }],
      linkedEntities: [],
      evidence: [],
      description: data.description,
    };
    createCase.mutate(newCase, {
      onSuccess: () => toast({ title: 'Case created', description: `${caseId} added.` }),
      onError: (err) => toast({ title: 'Failed to create case', description: err.message, variant: 'destructive' }),
    });
  }, [createCase, toast]);
  
  const filteredCases = useMemo(() => {
    if (statusFilter === 'all') return cases;
    return cases.filter(c => c.status === statusFilter);
  }, [cases, statusFilter]);

  // Smart summary stats
  const summaryStats = useMemo(() => {
    const open = cases.filter(c => c.status === 'open');
    const inReview = cases.filter(c => c.status === 'in_review');
    const escalated = cases.filter(c => c.status === 'escalated');
    const resolved = cases.filter(c => c.status === 'closed');

    const avgAgeHours = open.length > 0
      ? Math.round(open.reduce((sum, c) => sum + differenceInHours(new Date(), new Date(c.createdAt)), 0) / open.length)
      : 0;

    const slaBreach = inReview.filter(c => {
      if (!c.dueDate) return false;
      return differenceInDays(new Date(c.dueDate), new Date()) <= 1;
    }).length;

    const amlLinked = escalated.filter(c => c.type === 'aml' || c.type === 'mixed').length;

    return { open, inReview, escalated, resolved, avgAgeHours, slaBreach, amlLinked };
  }, [cases]);

  // Case risk mix for pie chart
  const riskMixData = useMemo(() => {
    const fraud = cases.filter(c => c.type === 'fraud').length;
    const aml = cases.filter(c => c.type === 'aml').length;
    const mixed = cases.filter(c => c.type === 'mixed').length;
    return [
      { name: 'Fraud', value: fraud, color: 'hsl(var(--destructive))' },
      { name: 'AML', value: aml, color: 'hsl(var(--warning))' },
      { name: 'Mixed', value: mixed, color: 'hsl(var(--primary))' },
    ];
  }, [cases]);

  const severityData = useMemo(() => {
    const critical = cases.filter(c => c.priority === 'critical').length;
    const high = cases.filter(c => c.priority === 'high').length;
    const medium = cases.filter(c => c.priority === 'medium').length;
    return [
      { name: 'Critical', value: critical, color: 'hsl(var(--destructive))' },
      { name: 'High', value: high, color: 'hsl(25 95% 53%)' },
      { name: 'Medium', value: medium, color: 'hsl(var(--warning))' },
    ];
  }, [cases]);
  
  const getStatusColor = (status: CaseStatus) => {
    switch (status) {
      case 'open': return 'bg-primary/20 text-primary border-primary/30';
      case 'in_review': return 'bg-warning/20 text-warning border-warning/30';
      case 'closed': return 'bg-success/20 text-success border-success/30';
      case 'escalated': return 'bg-destructive/20 text-destructive border-destructive/30';
    }
  };
  
  const getSLACountdown = (dueDate: string | undefined) => {
    if (!dueDate) return null;
    const hours = differenceInHours(new Date(dueDate), new Date());
    if (hours < 0) return { label: 'SLA Breached', color: 'text-destructive bg-destructive/10', urgent: true };
    if (hours <= 4) return { label: `${hours}h remaining`, color: 'text-destructive bg-destructive/10', urgent: true };
    if (hours <= 24) return { label: `${hours}h remaining`, color: 'text-warning bg-warning/10', urgent: false };
    const days = Math.floor(hours / 24);
    return { label: `${days}d ${hours % 24}h`, color: 'text-muted-foreground bg-muted/50', urgent: false };
  };

  const getTriggerSource = () => {
    const sources = ['Model', 'Rule', 'External'];
    return sources[Math.floor(Math.random() * sources.length)];
  };

  // AI recommendation for side drawer
  const getAIRecommendation = (caseItem: Case) => {
    if (caseItem.type === 'fraud') {
      return { confidence: 92, action: 'Block + SAR review', summary: 'Likely fraud — pattern matches known velocity-based card testing with device spoofing.' };
    }
    if (caseItem.type === 'aml') {
      return { confidence: 78, action: 'Escalate to AML team', summary: 'Structuring pattern detected — multiple sub-threshold transactions across accounts.' };
    }
    return { confidence: 85, action: 'Further investigation', summary: 'Mixed indicators — fraud velocity combined with AML geographic risk factors.' };
  };
  
  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-primary" />
            Case Management
          </h1>
          <p className="text-muted-foreground">Investigate and resolve fraud and AML cases</p>
        </div>
        {canCreateCase && (
          <Button onClick={() => setIsNewCaseOpen(true)} data-testid="button-new-case">
            <Plus className="h-4 w-4 mr-2" />
            New Case
          </Button>
        )}
      </div>
      
      {/* Smart Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="stat-card border-l-4 border-l-primary">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-muted-foreground">Open Cases</p>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-3xl font-bold">{summaryStats.open.length}</p>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-xs text-muted-foreground mt-1 cursor-help">
                Avg age: {summaryStats.avgAgeHours}h
              </p>
            </TooltipTrigger>
            <TooltipContent>Average time since case creation for open cases</TooltipContent>
          </Tooltip>
        </div>
        <div className="stat-card border-l-4 border-l-warning">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-muted-foreground">In Review</p>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <p className="text-3xl font-bold">{summaryStats.inReview.length}</p>
          <p className="text-xs text-warning mt-1">
            {summaryStats.slaBreach} at SLA breach risk
          </p>
        </div>
        <div className="stat-card border-l-4 border-l-destructive">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-muted-foreground">Escalated</p>
            <Shield className="h-4 w-4 text-destructive" />
          </div>
          <p className="text-3xl font-bold">{summaryStats.escalated.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {summaryStats.amlLinked} AML-linked
          </p>
        </div>
        <div className="stat-card border-l-4 border-l-success">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm text-muted-foreground">Closed</p>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </div>
          <p className="text-3xl font-bold">{summaryStats.resolved.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            False-positive rate: ~12%
          </p>
        </div>
      </div>

      {/* Case Risk Mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="stat-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Case Type Distribution</h3>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={riskMixData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                  {riskMixData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 text-xs">
            {riskMixData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-muted-foreground">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
        <div className="stat-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Severity Distribution</h3>
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={severityData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value" paddingAngle={3}>
                  {severityData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 text-xs">
            {severityData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-muted-foreground">{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
        <div className="stat-card">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Analyst Workload</h3>
          <div className="space-y-3 mt-2">
            {['analyst-1', 'analyst-2', 'analyst-3', 'analyst-4', 'analyst-5'].map(analyst => {
              const count = cases.filter(c => c.assignedTo === analyst && c.status !== 'closed').length;
              return (
                <div key={analyst} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-20 truncate capitalize">{analyst.replace('-', ' ')}</span>
                  <Progress value={count * 20} className="h-2 flex-1" />
                  <span className="text-xs font-mono w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search cases..." className="pl-9" />
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'open', 'in_review', 'escalated', 'closed'] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="capitalize"
            >
              {status.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </div>
      
      {/* Cases grid + Side Drawer */}
      <div className="flex gap-4">
        <div className={cn("grid grid-cols-1 gap-4 flex-1 transition-all", selectedCase ? 'lg:grid-cols-2' : 'lg:grid-cols-2 xl:grid-cols-3')}>
          {filteredCases.map((caseItem) => {
            const sla = getSLACountdown(caseItem.dueDate);
            const triggerSource = getTriggerSource();
            
            return (
              <div
                key={caseItem.id}
                onClick={() => setSelectedCase(caseItem)}
                className={cn(
                  "stat-card hover:border-primary/50 cursor-pointer transition-all group",
                  selectedCase?.id === caseItem.id && "border-primary/70 ring-1 ring-primary/20"
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono font-semibold text-sm">{caseItem.id}</span>
                      <Badge variant="outline" className={cn('text-xs', getStatusColor(caseItem.status))}>
                        {caseItem.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-xs capitalize">{caseItem.type}</Badge>
                      <Badge variant="secondary" className="text-xs">{triggerSource}</Badge>
                    </div>
                  </div>
                  <RiskScoreBadge score={0} level={caseItem.priority} showScore={false} size="sm" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-mono text-xs">{caseItem.customerId}</span>
                  </div>
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDistanceToNow(new Date(caseItem.createdAt), { addSuffix: true })}</span>
                  </div>

                  {caseItem.assignedTo && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      <span className="capitalize">{caseItem.assignedTo.replace('-', ' ')}</span>
                    </div>
                  )}
                  
                  {sla && (
                    <div className={cn('flex items-center gap-1.5 text-xs px-2 py-1 rounded-md w-fit', sla.color)}>
                      <Timer className="h-3 w-3" />
                      <span className="font-medium">{sla.label}</span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Alerts: {caseItem.alertIds.length}</span>
                    <span>Txns: {caseItem.transactionIds.length}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Case Side Drawer */}
        {selectedCase && (() => {
          const rec = getAIRecommendation(selectedCase);
          const sla = getSLACountdown(selectedCase.dueDate);
          return (
            <div className="w-96 shrink-0 stat-card overflow-y-auto max-h-[calc(100vh-280px)] animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{selectedCase.id}</h3>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedCase(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Status & Priority */}
              <div className="flex items-center gap-2 mb-4">
                <Badge variant="outline" className={cn('text-xs', getStatusColor(selectedCase.status))}>
                  {selectedCase.status.replace('_', ' ')}
                </Badge>
                <RiskScoreBadge score={0} level={selectedCase.priority} showScore={false} size="sm" />
                <Badge variant="outline" className="text-xs capitalize">{selectedCase.type}</Badge>
              </div>

              {sla && (
                <div className={cn('flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md mb-4', sla.color)}>
                  <Timer className="h-3.5 w-3.5" />
                  <span className="font-medium">{sla.label}</span>
                </div>
              )}

              {/* AI Recommendation */}
              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-xs font-medium">AI Assessment</span>
                  <Badge variant="secondary" className="text-xs ml-auto">{rec.confidence}% confidence</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{rec.summary}</p>
                <p className="text-xs font-medium">Suggested action: {rec.action}</p>
              </div>

              {/* Timeline */}
              <div className="mb-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-3">Timeline</h4>
                <div className="space-y-3 border-l-2 border-border pl-4">
                  <div className="relative">
                    <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-primary" />
                    <p className="text-xs font-medium">Case created</p>
                    <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(selectedCase.createdAt), { addSuffix: true })}</p>
                  </div>
                  <div className="relative">
                    <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-warning" />
                    <p className="text-xs font-medium">Alert triggered</p>
                    <p className="text-xs text-muted-foreground">{selectedCase.alertIds.length} alert(s) linked</p>
                  </div>
                  {selectedCase.assignedTo && (
                    <div className="relative">
                      <div className="absolute -left-[21px] top-0.5 w-2.5 h-2.5 rounded-full bg-success" />
                      <p className="text-xs font-medium">Assigned to {selectedCase.assignedTo}</p>
                      <p className="text-xs text-muted-foreground">Auto-assigned by workload balancer</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Linked transactions */}
              <div className="mb-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Linked Transactions ({selectedCase.transactionIds.length})</h4>
                <div className="space-y-1.5">
                  {selectedCase.transactionIds.slice(0, 3).map(txId => (
                    <div key={txId} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                      <span className="font-mono">{txId}</span>
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div className="mb-4">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Tags</h4>
                <div className="flex flex-wrap gap-1">
                  {selectedCase.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                </div>
              </div>

              {/* Analyst Assist Actions */}
              <div className="space-y-2 pt-3 border-t border-border">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">Analyst Actions</h4>
                <Button variant="outline" size="sm" className="w-full justify-start text-xs">
                  <FileText className="h-3.5 w-3.5 mr-2" />
                  Summarise Case
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start text-xs">
                  <Search className="h-3.5 w-3.5 mr-2" />
                  Show Similar Resolved Cases
                </Button>
                <Button variant="outline" size="sm" className="w-full justify-start text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 mr-2" />
                  Explain Escalation Rationale
                </Button>
                <Button size="sm" className="w-full text-xs mt-2" data-testid="button-open-investigation" onClick={() => navigate(`/cases/${selectedCase.id}`)}>
                  Open Full Investigation
                </Button>
              </div>
            </div>
          );
        })()}
      </div>
      
      {filteredCases.length === 0 && (
        <div className="text-center py-12">
          <Briefcase className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">{isLoading ? 'Loading cases…' : 'No cases found'}</p>
        </div>
      )}
      
      <NewCaseDialog open={isNewCaseOpen} onOpenChange={setIsNewCaseOpen} onCaseCreated={handleCaseCreated} />
    </div>
  );
};

export default Cases;
