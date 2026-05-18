import { useState } from 'react';
import {
  BarChart3,
  Download,
  BookOpen,
  ChevronRight,
  Clock,
  Shield,
  AlertTriangle,
  Globe,
  Cpu,
  Scale,
  Users,
  Activity,
  ClipboardList,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { AnalyticsFilters } from '@/lib/analytics-data';
import { useAnalyticsTabQuery } from '@/hooks/use-analytics-api';
import { Skeleton } from '@/components/ui/skeleton';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { FraudTab } from '@/components/analytics/FraudTab';
import { AMLTab } from '@/components/analytics/AMLTab';
import { ModelsTab } from '@/components/analytics/ModelsTab';
import { RulesTab } from '@/components/analytics/RulesTab';
import { GeographyTab } from '@/components/analytics/GeographyTab';
import { ChannelsTab } from '@/components/analytics/ChannelsTab';
import { UsersTab } from '@/components/analytics/UsersTab';
import { OperationsTab } from '@/components/analytics/OperationsTab';
import { AuditTab } from '@/components/analytics/AuditTab';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';

const Analytics = () => {
  const [timeRange, setTimeRange] = useState<AnalyticsFilters['timeRange']>('30d');
  const [channel, setChannel] = useState<AnalyticsFilters['channel']>('all');
  const [country, setCountry] = useState<AnalyticsFilters['country']>('all');
  const navigate = useNavigate();
  const { toast } = useToast();

  const filters: AnalyticsFilters = { timeRange, channel, country };

  // Per-tab queries — each tab is a discrete server-side rollup, all 10 are
  // requested in parallel on mount so switching tabs is instant. The
  // queryKey includes filters, so changing window/channel/country triggers a
  // refetch across every tab.
  const executive = useAnalyticsTabQuery('executive', filters);
  const fraud = useAnalyticsTabQuery('fraud', filters);
  const aml = useAnalyticsTabQuery('aml', filters);
  const models = useAnalyticsTabQuery('models', filters);
  const rules = useAnalyticsTabQuery('rules', filters);
  const geography = useAnalyticsTabQuery('geography', filters);
  const channels_ = useAnalyticsTabQuery('channels', filters);
  const usersData = useAnalyticsTabQuery('users', filters);
  const operations = useAnalyticsTabQuery('operations', filters);
  const audit = useAnalyticsTabQuery('audit', filters);

  const tabPlaceholder = (
    <div className="space-y-3" data-testid="analytics-loading">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  const emptyState = (label: string) => (
    <div className="border border-dashed border-border/60 rounded-lg p-10 text-center" data-testid={`empty-${label}`}>
      <p className="text-sm font-medium">No {label} data for the selected window</p>
      <p className="text-xs text-muted-foreground mt-1">
        Try widening the time range or clearing the channel/country filter.
      </p>
    </div>
  );

  // A tab is "empty" when the request succeeded but every collection on the
  // payload is empty. Each tab has its own shape so the predicate is per-tab.
  const isEmpty = {
    fraud: (d: typeof fraud.data) => !!d &&
      d.fraudTrend.every(p => !p.detected && !p.prevented && !p.actualLoss) &&
      !d.topTypologies.length && !d.riskyMerchants.length && !d.riskyCustomers.length && !d.riskyDevices.length,
    aml: (d: typeof aml.data) => !!d &&
      d.amlTrend.every(p => !p.alerts) && !d.typologyDistribution.length && !d.highRiskCustomers.length,
    models: (d: typeof models.data) => !!d &&
      !d.performanceComparison.length && d.scoreDistribution.every(b => !b.count),
    rules: (d: typeof rules.data) => !!d && !d.rulesTable.length,
    geography: (d: typeof geography.data) => !!d && !d.countries.length,
    channels: (d: typeof channels_.data) => !!d && !d.channelVolume.length,
    users: (d: typeof usersData.data) => !!d && !d.roleDistribution.length,
    operations: (d: typeof operations.data) => !!d &&
      !d.oldestCases.length && !d.teamQueues.length && d.caseAging.every(b => !b.count),
    audit: (d: typeof audit.data) => !!d && !d.auditEvents.length,
  };

  function renderTab<T>(
    label: string,
    q: { data?: T; error?: unknown },
    empty: (d: T | undefined) => boolean,
    render: (d: T) => JSX.Element,
  ): JSX.Element {
    if (q.error) {
      const msg = q.error instanceof Error ? q.error.message : String(q.error);
      return <div className="border border-destructive/40 rounded-lg p-6 text-sm text-destructive" data-testid={`error-${label}`}>Failed to load {label}: {msg}</div>;
    }
    if (!q.data) return tabPlaceholder;
    if (empty(q.data)) return emptyState(label);
    return render(q.data);
  }

  const [evidenceDrawer, setEvidenceDrawer] = useState<{ open: boolean; title: string; evidence: string; sections?: { label: string; value: string | number }[] }>({ open: false, title: '', evidence: '' });

  const handleExport = (format: string) => {
    toast({ title: `Export Started`, description: `Your ${format.toUpperCase()} report is being generated and will download shortly.` });
  };

  const priorityColor = (p: string) => p === 'high' ? 'text-destructive' : p === 'medium' ? 'text-warning' : 'text-primary';

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <BarChart3 className="h-6 w-6 text-primary" />
            Analytics & Reporting
          </h1>
          <p className="text-muted-foreground">Performance metrics, trend analysis, and regulatory reporting</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
            {(['24h', '7d', '30d', '90d'] as const).map(r => (
              <Button key={r} variant={timeRange === r ? 'default' : 'ghost'} size="sm" className="text-xs h-7" onClick={() => setTimeRange(r)} data-testid={`button-range-${r}`}>
                {r}
              </Button>
            ))}
          </div>
          <Select value={channel} onValueChange={(v) => setChannel(v as AnalyticsFilters['channel'])}>
            <SelectTrigger className="w-[100px] h-8 text-xs" data-testid="select-channel"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="pos">POS</SelectItem>
              <SelectItem value="web">Web</SelectItem>
              <SelectItem value="mobile">Mobile</SelectItem>
              <SelectItem value="atm">ATM</SelectItem>
              <SelectItem value="branch">Branch</SelectItem>
            </SelectContent>
          </Select>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-[110px] h-8 text-xs" data-testid="select-country"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              <SelectItem value="US">United States</SelectItem>
              <SelectItem value="GB">United Kingdom</SelectItem>
              <SelectItem value="NG">Nigeria</SelectItem>
              <SelectItem value="RU">Russia</SelectItem>
              <SelectItem value="CN">China</SelectItem>
              <SelectItem value="BR">Brazil</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="pdf" onValueChange={handleExport}>
            <SelectTrigger className="w-[80px] h-8 text-xs" data-testid="select-export">
              <Download className="h-3 w-3 mr-1" /><SelectValue placeholder="Export" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pdf">PDF</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="png">PNG</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Updated 12 min ago</span>
          </div>
        </div>
      </div>

      <div className="stat-card border-l-4 border-l-primary">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Executive Summary</h3>
          <Badge variant="secondary" className="text-xs ml-auto">{timeRange} window</Badge>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Key Insights</p>
            {executive.isLoading && <Skeleton className="h-16 w-full" />}
            {executive.error && <p className="text-xs text-destructive">Failed to load insights: {executive.error.message}</p>}
            {(executive.data?.insights ?? []).map((item, i) => (
              <button key={i} className="flex items-start gap-2 text-sm w-full text-left hover:bg-muted/30 rounded-md p-1.5 -ml-1.5 transition-colors"
                data-testid={`insight-${i}`}
                onClick={() => setEvidenceDrawer({ open: true, title: item.text.slice(0, 60) + '...', evidence: item.evidence, sections: [{ label: 'Severity', value: item.severity }, { label: 'Key Metric', value: item.metric }] })}>
                <div className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0",
                  item.severity === 'critical' && 'bg-destructive',
                  item.severity === 'warning' && 'bg-warning',
                  item.severity === 'info' && 'bg-primary'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="text-muted-foreground text-xs">{item.text}</p>
                  <span className="text-[10px] text-primary font-medium">{item.metric} · View evidence →</span>
                </div>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">Recommended Actions</p>
            {(executive.data?.recommendedActions ?? []).map((action, i) => (
              <button key={i} className="flex items-center gap-2 text-xs w-full text-left hover:bg-muted/30 rounded-md p-2 transition-colors group"
                data-testid={`action-${i}`}
                onClick={() => navigate(action.linkTo)}>
                <div className={cn("w-1 h-6 rounded-full shrink-0", priorityColor(action.priority).replace('text-', 'bg-'))} />
                <span className="flex-1 text-muted-foreground">{action.text}</span>
                <Badge variant="outline" className={cn("text-[9px] shrink-0", priorityColor(action.priority))}>{action.priority}</Badge>
                <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>

      <Tabs defaultValue="fraud" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-auto min-w-full sm:min-w-0">
            <TabsTrigger value="fraud" className="text-xs gap-1" data-testid="tab-fraud"><Shield className="h-3 w-3" />Fraud</TabsTrigger>
            <TabsTrigger value="aml" className="text-xs gap-1" data-testid="tab-aml"><Scale className="h-3 w-3" />AML</TabsTrigger>
            <TabsTrigger value="models" className="text-xs gap-1" data-testid="tab-models"><Cpu className="h-3 w-3" />Models</TabsTrigger>
            <TabsTrigger value="rules" className="text-xs gap-1" data-testid="tab-rules"><FileText className="h-3 w-3" />Rules</TabsTrigger>
            <TabsTrigger value="geo" className="text-xs gap-1" data-testid="tab-geo"><Globe className="h-3 w-3" />Geography</TabsTrigger>
            <TabsTrigger value="channels" className="text-xs gap-1" data-testid="tab-channels"><Activity className="h-3 w-3" />Channels</TabsTrigger>
            <TabsTrigger value="users" className="text-xs gap-1" data-testid="tab-users"><Users className="h-3 w-3" />Users</TabsTrigger>
            <TabsTrigger value="operations" className="text-xs gap-1" data-testid="tab-ops"><ClipboardList className="h-3 w-3" />Operations</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs gap-1" data-testid="tab-audit"><AlertTriangle className="h-3 w-3" />Audit</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="fraud">{renderTab('fraud', fraud, isEmpty.fraud, d => <FraudTab data={d} />)}</TabsContent>
        <TabsContent value="aml">{renderTab('AML', aml, isEmpty.aml, d => <AMLTab data={d} />)}</TabsContent>
        <TabsContent value="models">{renderTab('models', models, isEmpty.models, d => <ModelsTab data={d} />)}</TabsContent>
        <TabsContent value="rules">{renderTab('rules', rules, isEmpty.rules, d => <RulesTab data={d} />)}</TabsContent>
        <TabsContent value="geo">{renderTab('geography', geography, isEmpty.geography, d => <GeographyTab data={d} />)}</TabsContent>
        <TabsContent value="channels">{renderTab('channels', channels_, isEmpty.channels, d => <ChannelsTab data={d} />)}</TabsContent>
        <TabsContent value="users">{renderTab('users', usersData, isEmpty.users, d => <UsersTab data={d} />)}</TabsContent>
        <TabsContent value="operations">{renderTab('operations', operations, isEmpty.operations, d => <OperationsTab data={d} />)}</TabsContent>
        <TabsContent value="audit">{renderTab('audit', audit, isEmpty.audit, d => <AuditTab data={d} />)}</TabsContent>
      </Tabs>

      <AnalyticsDrawer open={evidenceDrawer.open} onOpenChange={(o) => setEvidenceDrawer(prev => ({ ...prev, open: o }))}
        title={evidenceDrawer.title} subtitle="Evidence & Supporting Data"
        sections={evidenceDrawer.sections}>
        <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
          <p className="text-xs font-medium text-muted-foreground mb-1">Supporting Evidence</p>
          <p className="text-xs text-foreground">{evidenceDrawer.evidence}</p>
        </div>
      </AnalyticsDrawer>
    </div>
  );
};

export default Analytics;
