import {
  AlertTriangle, Shield, TrendingUp, FileText, Briefcase, ChevronDown, ChevronRight,
  Copy, Download, ExternalLink, Plus, Network, BarChart3, Clock, User, CreditCard,
  CheckCircle2, XCircle, ArrowRight, Tag, Scale, Activity, Globe, Smartphone,
  DollarSign, Percent, Bell, ShieldAlert, Hash, Layers
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import type { AIResponseEnvelope, AIResponseSection, AIResponseAction } from '@/lib/ai-response-parser';

interface RendererProps {
  envelope: AIResponseEnvelope;
}

const INTENT_ICONS: Record<string, typeof Shield> = {
  transaction_analysis: CreditCard,
  customer_analysis: User,
  sar_draft: FileText,
  analytics_summary: BarChart3,
  case_summary: Briefcase,
  general_answer: Layers,
};

const INTENT_LABELS: Record<string, string> = {
  transaction_analysis: 'Transaction Investigation',
  customer_analysis: 'Customer Risk Profile',
  sar_draft: 'SAR Narrative Draft',
  analytics_summary: 'Analytics & Trends',
  case_summary: 'Case Summary',
  general_answer: 'AI Analysis',
};

const INTENT_COLORS: Record<string, string> = {
  transaction_analysis: 'text-warning',
  customer_analysis: 'text-primary',
  sar_draft: 'text-destructive',
  analytics_summary: 'text-success',
  case_summary: 'text-accent',
  general_answer: 'text-muted-foreground',
};

function ActionBar({ actions }: { actions: AIResponseAction[] }) {
  const { toast } = useToast();
  if (!actions.length) return null;

  const handleAction = (action: AIResponseAction) => {
    toast({ title: action.label, description: `Action "${action.label}" triggered` });
  };

  return (
    <div className="flex flex-wrap gap-2 pt-3 border-t border-border mt-4">
      {actions.map((action, i) => (
        <Button
          key={i}
          variant="outline"
          size="sm"
          className="text-xs h-7 gap-1.5"
          onClick={() => handleAction(action)}
          data-testid={`button-action-${action.type}`}
        >
          {action.type === 'create_case' && <Plus className="h-3 w-3" />}
          {action.type === 'draft_sar' && <FileText className="h-3 w-3" />}
          {action.type === 'export' && <Download className="h-3 w-3" />}
          {action.type === 'view_transaction' && <ExternalLink className="h-3 w-3" />}
          {action.type === 'view_customer' && <ExternalLink className="h-3 w-3" />}
          {action.type === 'open_graph' && <Network className="h-3 w-3" />}
          {action.type === 'open_case' && <ExternalLink className="h-3 w-3" />}
          {action.type === 'open_analytics' && <BarChart3 className="h-3 w-3" />}
          {action.type === 'add_to_case' && <Plus className="h-3 w-3" />}
          {action.label}
        </Button>
      ))}
    </div>
  );
}

function SectionRenderer({ section }: { section: AIResponseSection }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mb-3">
      {section.heading && (
        <button
          className="flex items-center gap-1.5 text-xs font-semibold text-foreground mb-1.5 hover:text-primary transition-colors w-full text-left"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {section.heading}
        </button>
      )}
      {expanded && (
        <>
          {section.type === 'bullets' && (
            <ul className="space-y-1 ml-4">
              {section.items.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-primary mt-1 flex-shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
          {section.type === 'text' && (
            <div className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              {section.items.map((item, i) => (
                <p key={i}>{item}</p>
              ))}
            </div>
          )}
          {section.type === 'table' && section.headers && section.rows && (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    {section.headers.map((h, i) => (
                      <th key={i} className="text-left px-2 py-1.5 font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, i) => (
                    <tr key={i} className="border-t border-border/50">
                      {row.map((cell, j) => (
                        <td key={j} className="px-2 py-1.5 text-foreground">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ResponseHeader({ envelope }: RendererProps) {
  const Icon = INTENT_ICONS[envelope.intent] || Layers;
  const color = INTENT_COLORS[envelope.intent];

  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className={cn('p-1.5 rounded-md bg-muted/80', color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-xs font-semibold text-foreground">{INTENT_LABELS[envelope.intent]}</p>
          {(envelope.entities.transaction_id || envelope.entities.customer_id || envelope.entities.case_id) && (
            <div className="flex gap-1.5 mt-0.5">
              {envelope.entities.transaction_id && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{envelope.entities.transaction_id}</Badge>
              )}
              {envelope.entities.customer_id && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{envelope.entities.customer_id}</Badge>
              )}
              {envelope.entities.case_id && (
                <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono">{envelope.entities.case_id}</Badge>
              )}
            </div>
          )}
        </div>
      </div>
      <Badge variant="outline" className={cn('text-[9px] h-5',
        envelope.confidence >= 0.8 ? 'border-success/30 text-success' :
        envelope.confidence >= 0.6 ? 'border-warning/30 text-warning' :
        'border-muted-foreground/30 text-muted-foreground'
      )}>
        {Math.round(envelope.confidence * 100)}% match
      </Badge>
    </div>
  );
}

function TransactionInvestigationView({ envelope }: RendererProps) {
  const riskSection = envelope.sections.find(s => s.heading.toLowerCase().includes('risk') || s.heading.toLowerCase().includes('factor') || s.heading.toLowerCase().includes('flag'));
  const otherSections = envelope.sections.filter(s => s !== riskSection);

  return (
    <div className="space-y-3">
      <ResponseHeader envelope={envelope} />
      {riskSection && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-destructive" /> Risk Drivers
          </p>
          {riskSection.items.map((item, i) => (
            <Card key={i} className="border-destructive/20 bg-destructive/5">
              <CardContent className="p-2.5 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-xs text-foreground">{item}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {otherSections.map((section, i) => <SectionRenderer key={i} section={section} />)}
      <ActionBar actions={envelope.actions} />
    </div>
  );
}

function CustomerRiskProfileView({ envelope }: RendererProps) {
  const patternSection = envelope.sections.find(s =>
    s.heading.toLowerCase().includes('pattern') || s.heading.toLowerCase().includes('behav') || s.heading.toLowerCase().includes('anomal')
  );
  const otherSections = envelope.sections.filter(s => s !== patternSection);

  return (
    <div className="space-y-3">
      <ResponseHeader envelope={envelope} />
      {patternSection && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
            <Activity className="h-3.5 w-3.5 text-primary" /> Behavioral Patterns
          </p>
          <ul className="space-y-1">
            {patternSection.items.map((item, i) => (
              <li key={i} className="text-xs text-foreground flex gap-2">
                <ArrowRight className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {otherSections.map((section, i) => <SectionRenderer key={i} section={section} />)}
      <ActionBar actions={envelope.actions} />
    </div>
  );
}

function SARDocumentView({ envelope }: RendererProps) {
  const { toast } = useToast();
  const sarSections = ['subject information', 'suspicious activity', 'transaction', 'evidence', 'narrative', 'recommended'];
  const docSections = envelope.sections.filter(s =>
    sarSections.some(kw => s.heading.toLowerCase().includes(kw))
  );
  const otherSections = envelope.sections.filter(s => !docSections.includes(s));

  const handleCopy = () => {
    navigator.clipboard.writeText(envelope.raw_text);
    toast({ title: 'Copied', description: 'SAR narrative copied to clipboard' });
  };

  return (
    <div className="space-y-3">
      <ResponseHeader envelope={envelope} />
      <div className="border border-border rounded-lg bg-card">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-destructive" /> SAR Document
          </p>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2" onClick={handleCopy}>
              <Copy className="h-3 w-3 mr-1" /> Copy
            </Button>
          </div>
        </div>
        <div className="p-3 space-y-3">
          {docSections.length > 0 ? (
            docSections.map((section, i) => (
              <div key={i}>
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">{section.heading}</p>
                {section.type === 'bullets' ? (
                  <ul className="space-y-1 ml-3">
                    {section.items.map((item, j) => (
                      <li key={j} className="text-xs text-foreground leading-relaxed">• {item}</li>
                    ))}
                  </ul>
                ) : (
                  section.items.map((item, j) => (
                    <p key={j} className="text-xs text-foreground leading-relaxed">{item}</p>
                  ))
                )}
                {i < docSections.length - 1 && <Separator className="mt-3" />}
              </div>
            ))
          ) : (
            envelope.sections.map((section, i) => (
              <div key={i}>
                {section.heading && <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-1.5">{section.heading}</p>}
                {section.type === 'bullets' ? (
                  <ul className="space-y-1 ml-3">
                    {section.items.map((item, j) => (
                      <li key={j} className="text-xs text-foreground leading-relaxed">• {item}</li>
                    ))}
                  </ul>
                ) : (
                  section.items.map((item, j) => (
                    <p key={j} className="text-xs text-foreground leading-relaxed">{item}</p>
                  ))
                )}
                {i < envelope.sections.length - 1 && <Separator className="mt-3" />}
              </div>
            ))
          )}
        </div>
      </div>
      {otherSections.length > 0 && otherSections.map((section, i) => <SectionRenderer key={i} section={section} />)}
      <ActionBar actions={envelope.actions} />
    </div>
  );
}

function AnalyticsInsightView({ envelope }: RendererProps) {
  const metricsSection = envelope.sections.find(s =>
    s.heading.toLowerCase().includes('kpi') || s.heading.toLowerCase().includes('metric') || s.heading.toLowerCase().includes('summary') || s.heading.toLowerCase().includes('overview')
  );
  const driversSection = envelope.sections.find(s =>
    s.heading.toLowerCase().includes('driver') || s.heading.toLowerCase().includes('indicator') || s.heading.toLowerCase().includes('top') || s.heading.toLowerCase().includes('trend')
  );
  const otherSections = envelope.sections.filter(s => s !== metricsSection && s !== driversSection);

  return (
    <div className="space-y-3">
      <ResponseHeader envelope={envelope} />
      {metricsSection && (
        <div className="grid grid-cols-2 gap-2">
          {metricsSection.items.slice(0, 4).map((item, i) => {
            const metricIcons = [DollarSign, Percent, Bell, Shield];
            const MetricIcon = metricIcons[i % metricIcons.length];
            const parts = item.split(/[:\-–]/);
            const label = parts[0]?.trim() || item;
            const value = parts[1]?.trim() || '';
            return (
              <Card key={i} className="bg-muted/30">
                <CardContent className="p-2.5 flex items-center gap-2">
                  <MetricIcon className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground truncate">{label}</p>
                    {value && <p className="text-xs font-semibold text-foreground">{value}</p>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {driversSection && (
        <div>
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
            <TrendingUp className="h-3.5 w-3.5 text-success" /> Key Drivers
          </p>
          <div className="space-y-1.5">
            {driversSection.items.map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-4 h-4 rounded-full bg-success/20 text-success flex items-center justify-center text-[9px] font-bold flex-shrink-0">{i + 1}</span>
                <span className="text-foreground">{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {otherSections.map((section, i) => <SectionRenderer key={i} section={section} />)}
      <ActionBar actions={envelope.actions} />
    </div>
  );
}

function CaseSummaryTimelineView({ envelope }: RendererProps) {
  const timelineSection = envelope.sections.find(s =>
    s.heading.toLowerCase().includes('timeline') || s.heading.toLowerCase().includes('event') || s.heading.toLowerCase().includes('history')
  );
  const entitySection = envelope.sections.find(s =>
    s.heading.toLowerCase().includes('entit') || s.heading.toLowerCase().includes('linked') || s.heading.toLowerCase().includes('related')
  );
  const recommendSection = envelope.sections.find(s =>
    s.heading.toLowerCase().includes('recommend') || s.heading.toLowerCase().includes('next') || s.heading.toLowerCase().includes('action')
  );
  const otherSections = envelope.sections.filter(s => s !== timelineSection && s !== entitySection && s !== recommendSection);

  return (
    <div className="space-y-3">
      <ResponseHeader envelope={envelope} />
      {timelineSection && (
        <div>
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2">
            <Clock className="h-3.5 w-3.5 text-accent" /> Timeline
          </p>
          <div className="border-l-2 border-accent/30 ml-2 pl-3 space-y-2">
            {timelineSection.items.map((item, i) => (
              <div key={i} className="relative">
                <div className="absolute -left-[19px] top-1 w-2 h-2 rounded-full bg-accent" />
                <p className="text-xs text-foreground">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {entitySection && (
        <div>
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
            <Tag className="h-3.5 w-3.5 text-primary" /> Linked Entities
          </p>
          <div className="flex flex-wrap gap-1.5">
            {entitySection.items.map((item, i) => (
              <Badge key={i} variant="outline" className="text-[10px] gap-1">
                <Hash className="h-2.5 w-2.5" /> {item}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {recommendSection && (
        <div className="rounded-lg border border-success/20 bg-success/5 p-3">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Recommendations
          </p>
          <ul className="space-y-1">
            {recommendSection.items.map((item, i) => (
              <li key={i} className="text-xs text-foreground flex gap-2">
                <ArrowRight className="h-3 w-3 text-success mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {otherSections.map((section, i) => <SectionRenderer key={i} section={section} />)}
      <ActionBar actions={envelope.actions} />
    </div>
  );
}

function StructuredAnswerView({ envelope }: RendererProps) {
  const keyTakeaways = envelope.sections.find(s =>
    s.heading.toLowerCase().includes('takeaway') || s.heading.toLowerCase().includes('key') || s.heading.toLowerCase().includes('summary')
  );
  const otherSections = envelope.sections.filter(s => s !== keyTakeaways);

  return (
    <div className="space-y-3">
      <ResponseHeader envelope={envelope} />
      {keyTakeaways && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-xs font-semibold text-foreground mb-1.5">Key Takeaways</p>
          <ul className="space-y-1">
            {keyTakeaways.items.map((item, i) => (
              <li key={i} className="text-xs text-foreground flex gap-2">
                <CheckCircle2 className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {otherSections.map((section, i) => <SectionRenderer key={i} section={section} />)}
      <ActionBar actions={envelope.actions} />
    </div>
  );
}

const VIEW_MAP: Record<string, (props: RendererProps) => JSX.Element> = {
  transaction_analysis: TransactionInvestigationView,
  customer_analysis: CustomerRiskProfileView,
  sar_draft: SARDocumentView,
  analytics_summary: AnalyticsInsightView,
  case_summary: CaseSummaryTimelineView,
  general_answer: StructuredAnswerView,
};

export function AIResponseRenderer({ envelope }: RendererProps) {
  const ViewComponent = VIEW_MAP[envelope.intent] || StructuredAnswerView;
  return <ViewComponent envelope={envelope} />;
}
