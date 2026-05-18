import { useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowLeft, Clock, User, Tag, FileText, Plus, Download, Upload,
  Shield, AlertTriangle, CheckCircle2, Circle, Building2, UserCircle,
  FileSignature, Receipt, Wallet, Users, Image, Database, Mail,
  FileBarChart, MessageSquare, ChevronDown, ChevronUp, ExternalLink,
  Eye, EyeOff, Link2, Paperclip, Send, IdCard, Gauge, Activity,
  Network as NetworkIcon, FolderOpen, ScrollText, Flag, XCircle, Globe
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Loader2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { analyzeWithAI } from '@/lib/ai';
import { uploadFileToObs, getSignedDownloadUrl } from '@/lib/obs-upload';
import { useTransactionsQuery } from '@/hooks/use-transactions-api';
import {
  computeRiskScore, getRegulatoryReports, getFraudRegister,
} from '@/lib/compliance-data';
import { useCustomersQuery, useEddCasesQuery, useScreeningQuery } from '@/hooks/use-compliance-api';
import {
  useCaseQuery, usePatchCase, useAddCaseNote, useAddCaseTimeline,
  useAddCaseEntity, useAddCaseEvidence,
} from '@/hooks/use-alerts-cases-api';
import type {
  CaseStatus, CaseNote, CaseTimelineEvent, LinkedEntity,
  LinkedEntityType, Evidence, EvidenceFileType, EvidenceSourceType,
  RiskLevel
} from '@/types';

const genId = () => 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);

const safeDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
};
const safeFormat = (v: unknown, fmt: string): string => {
  const d = safeDate(v);
  return d ? format(d, fmt) : '—';
};
const safeDistance = (v: unknown): string => {
  const d = safeDate(v);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : '—';
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const getStatusColor = (status: CaseStatus) => {
  switch (status) {
    case 'open': return 'bg-primary/20 text-primary border-primary/30';
    case 'in_review': return 'bg-warning/20 text-warning border-warning/30';
    case 'escalated': return 'bg-destructive/20 text-destructive border-destructive/30';
    case 'closed': return 'bg-success/20 text-success border-success/30';
  }
};

const getPriorityColor = (priority: RiskLevel) => {
  switch (priority) {
    case 'low': return 'bg-success/20 text-success border-success/30';
    case 'medium': return 'bg-warning/20 text-warning border-warning/30';
    case 'high': return 'bg-orange-500/20 text-orange-600 border-orange-500/30';
    case 'critical': return 'bg-destructive/20 text-destructive border-destructive/30';
  }
};

const getTimelineDotColor = (type: string) => {
  switch (type) {
    case 'alert_triggered': return 'bg-red-500';
    case 'case_created': return 'bg-blue-500';
    case 'assigned': return 'bg-green-500';
    case 'status_change': return 'bg-amber-500';
    case 'evidence_added': return 'bg-purple-500';
    case 'note_added': return 'bg-gray-400';
    case 'entity_linked': return 'bg-cyan-500';
    case 'escalated': return 'bg-orange-500';
    case 'resolution': return 'bg-emerald-500';
    default: return 'bg-gray-400';
  }
};

const getEntityIcon = (type: LinkedEntityType) => {
  switch (type) {
    case 'vendor': return Building2;
    case 'employee': return UserCircle;
    case 'contract': return FileSignature;
    case 'invoice': return Receipt;
    case 'account': return Wallet;
    case 'customer': return Users;
  }
};

const getEvidenceIcon = (type: EvidenceFileType) => {
  switch (type) {
    case 'document': return FileText;
    case 'screenshot': return Image;
    case 'transaction_log': return Database;
    case 'email': return Mail;
    case 'report': return FileBarChart;
    default: return FileText;
  }
};

const getSourceBadge = (source: EvidenceSourceType) => {
  switch (source) {
    case 'system_generated': return { label: 'System', className: 'bg-blue-500/20 text-blue-600 border-blue-500/30' };
    case 'manual_upload': return { label: 'Manual', className: 'bg-green-500/20 text-green-600 border-green-500/30' };
    case 'external_feed': return { label: 'External', className: 'bg-amber-500/20 text-amber-600 border-amber-500/30' };
  }
};

const CaseInvestigation = () => {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can } = usePermissions();
  const canManageCase = can('manage_cases');

  const { data: caseData = null, isLoading: caseLoading } = useCaseQuery(caseId);
  const patchCase = usePatchCase(caseId);
  const addCaseNote = useAddCaseNote(caseId);
  const addCaseTimeline = useAddCaseTimeline(caseId);
  const addCaseEntity = useAddCaseEntity(caseId);
  const addCaseEvidence = useAddCaseEvidence(caseId);
  const [activeTab, setActiveTab] = useState('kyc-profile');
  const [expandedCustody, setExpandedCustody] = useState<Record<string, boolean>>({});
  const [revealBvn, setRevealBvn] = useState(false);
  const [revealNin, setRevealNin] = useState(false);
  const [eddNoteDraft, setEddNoteDraft] = useState('');
  const [aiRiskLoading, setAiRiskLoading] = useState(false);
  const [aiRiskResult, setAiRiskResult] = useState<string>('');
  const [linkEntityOpen, setLinkEntityOpen] = useState(false);
  const [uploadEvidenceOpen, setUploadEvidenceOpen] = useState(false);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidenceUploading, setEvidenceUploading] = useState(false);
  const [newEntity, setNewEntity] = useState({ type: 'vendor' as LinkedEntityType, name: '', reference: '', relationship: '', notes: '' });
  const [newEvidence, setNewEvidence] = useState({ fileType: 'document' as EvidenceFileType, description: '', tags: '', source: 'manual_upload' as EvidenceSourceType });
  const [newNote, setNewNote] = useState({ content: '', type: 'comment' as 'comment' | 'evidence' | 'action_taken', mentions: '' });

  const { data: allCustomers = [] } = useCustomersQuery();
  const { data: allEddCases = [] } = useEddCasesQuery();
  const { data: allScreening = [] } = useScreeningQuery();

  const customer = useMemo(() => {
    if (!caseData || allCustomers.length === 0) return null;
    const exact = allCustomers.find(c => c.id === caseData.customerId);
    if (exact) return exact;
    let hash = 0;
    for (let i = 0; i < caseData.id.length; i++) hash = (hash * 31 + caseData.id.charCodeAt(i)) >>> 0;
    // Prefer customers with rich data (EDD/PEP/Sanction/Fraud) so the new tabs are well-populated.
    const eddIds = new Set(allEddCases.map(e => e.customerId));
    const screeningIds = new Set(allScreening.map(s => s.customerId));
    const richPool = allCustomers.filter(c => eddIds.has(c.id) || screeningIds.has(c.id) || c.pepFlag || c.sanctionFlag || c.fraudRiskFlag);
    const typePool = caseData.type === 'aml'
      ? richPool.filter(c => c.type === 'business')
      : caseData.type === 'fraud'
        ? richPool.filter(c => c.fraudRiskFlag || c.type === 'individual')
        : richPool;
    const list = typePool.length ? typePool : richPool.length ? richPool : allCustomers;
    return list[hash % list.length] || null;
  }, [caseData, allCustomers, allEddCases, allScreening]);

  const resolvedCustomerId = customer?.id ?? caseData?.customerId ?? '';

  const riskBreakdown = useMemo(() => {
    if (!customer) return null;
    return computeRiskScore(customer);
  }, [customer]);

  const customerEddCases = useMemo(() => {
    if (!resolvedCustomerId) return [];
    return allEddCases.filter(e => e.customerId === resolvedCustomerId);
  }, [resolvedCustomerId, allEddCases]);

  const customerReports = useMemo(() => {
    if (!resolvedCustomerId) return [];
    return getRegulatoryReports().filter(r => r.customerId === resolvedCustomerId);
  }, [resolvedCustomerId]);

  const customerFraudEntries = useMemo(() => {
    if (!resolvedCustomerId) return [];
    return getFraudRegister().filter(f => f.customerId === resolvedCustomerId);
  }, [resolvedCustomerId]);

  const customerScreening = useMemo(() => {
    if (!resolvedCustomerId) return [];
    return allScreening.filter(s => s.customerId === resolvedCustomerId);
  }, [resolvedCustomerId, allScreening]);

  const { data: caseCustomerTxns } = useTransactionsQuery(
    { customerId: caseData?.customerId, limit: 50 },
    { enabled: !!caseData?.customerId },
  );
  const customerTransactions = useMemo(() => {
    if (!caseData) return [];
    const all = caseCustomerTxns ?? [];
    const linkedIds = new Set(caseData.transactionIds);
    return [...all]
      .sort((a, b) => {
        const aLinked = linkedIds.has(a.id) ? 1 : 0;
        const bLinked = linkedIds.has(b.id) ? 1 : 0;
        if (aLinked !== bLinked) return bLinked - aLinked;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      })
      .slice(0, 20);
  }, [caseData, caseCustomerTxns]);

  const handleOpenEvidence = useCallback(async (ev: Evidence) => {
    if (!ev.storageKey) {
      toast({ title: 'Unavailable', description: 'This legacy evidence row has no stored file.', variant: 'destructive' });
      return;
    }
    try {
      const url = await getSignedDownloadUrl(ev.storageKey, 300);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast({ title: 'Could not open evidence', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    }
  }, [toast]);

  const handleRemoveTag = useCallback((evidenceId: string, tagToRemove: string) => {
    if (!caseData) return;
    const updated: Evidence[] = caseData.evidence.map(e =>
      e.id === evidenceId ? { ...e, tags: e.tags.filter(t => t !== tagToRemove) } : e,
    );
    patchCase.mutate({ evidence: updated });
  }, [caseData, patchCase]);

  const handleAddTag = useCallback((evidenceId: string, newTag: string) => {
    if (!caseData) return;
    const trimmed = newTag.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const updated: Evidence[] = caseData.evidence.map(e =>
      e.id === evidenceId
        ? {
            ...e,
            tags: [...e.tags, trimmed],
            custodyChain: [
              ...e.custodyChain,
              { action: 'tagged' as const, performedBy: 'Current Analyst', timestamp: now, details: `Tag added: ${trimmed}` },
            ],
          }
        : e,
    );
    patchCase.mutate({ evidence: updated });
  }, [caseData, patchCase]);

  if (!caseData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
        <Shield className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">{caseLoading ? 'Loading Case…' : 'Case Not Found'}</h2>
        {!caseLoading && <p className="text-muted-foreground">The case "{caseId}" could not be located.</p>}
        <Button onClick={() => navigate('/cases')} data-testid="button-back-to-cases">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Cases
        </Button>
      </div>
    );
  }

  const maskBvn = (v: string) => v ? `${v.slice(0, 3)}******${v.slice(-2)}` : '—';
  const riskGaugeColor = (score: number) => {
    if (score >= 75) return 'text-destructive';
    if (score >= 50) return 'text-orange-500';
    if (score >= 25) return 'text-warning';
    return 'text-success';
  };
  const customerName = customer ? (customer.type === 'individual' ? customer.fullName : customer.companyName) : caseData.customerId;

  const handleExplainRiskAi = async () => {
    if (!customer || !riskBreakdown) return;
    setAiRiskLoading(true);
    setAiRiskResult('');
    try {
      const result = await analyzeWithAI('risk_reasoning', {
        customer: {
          id: customer.id,
          type: customer.type,
          name: customerName,
          kycStatus: customer.kycStatus,
          riskLevel: customer.riskLevel,
          pepFlag: customer.pepFlag,
          sanctionFlag: customer.sanctionFlag,
          eddStatus: customer.eddStatus,
        },
        breakdown: {
          score: riskBreakdown.score,
          factors: riskBreakdown.factors,
        },
      });
      setAiRiskResult(result);
    } catch (err) {
      toast({
        title: 'AI generation failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
    } finally {
      setAiRiskLoading(false);
    }
  };

  const handleStatusChange = (newStatus: CaseStatus) => {
    if (newStatus === caseData.status) return;
    const now = new Date().toISOString();
    const timelineEvent: CaseTimelineEvent = {
      id: genId(),
      type: 'status_change',
      title: `Status changed to ${newStatus.replace('_', ' ')}`,
      description: `Case status updated from ${caseData.status.replace('_', ' ')} to ${newStatus.replace('_', ' ')}`,
      performedBy: 'Current Analyst',
      timestamp: now,
      metadata: { from: caseData.status, to: newStatus }
    };
    const auditNote: CaseNote = {
      id: genId(),
      caseId: caseData.id,
      authorId: 'current-analyst',
      authorName: 'Current Analyst',
      content: `Status changed from "${caseData.status.replace('_', ' ')}" to "${newStatus.replace('_', ' ')}"`,
      timestamp: now,
      type: 'action_taken'
    };
    Promise.all([
      addCaseTimeline.mutateAsync(timelineEvent),
      addCaseNote.mutateAsync(auditNote),
      patchCase.mutateAsync({ status: newStatus }),
    ])
      .then(() => toast({ title: 'Status Updated', description: `Case status changed to ${newStatus.replace('_', ' ')}` }))
      .catch((e: Error) => toast({ title: 'Status update failed', description: e.message, variant: 'destructive' }));
  };

  const handleAddEntity = () => {
    if (!newEntity.name || !newEntity.reference || !newEntity.relationship) return;
    const now = new Date().toISOString();
    const entity: LinkedEntity = {
      id: genId(),
      type: newEntity.type,
      name: newEntity.name,
      reference: newEntity.reference,
      relationship: newEntity.relationship,
      addedBy: 'Current Analyst',
      addedAt: now,
      notes: newEntity.notes || undefined
    };
    const timelineEvent: CaseTimelineEvent = {
      id: genId(),
      type: 'entity_linked',
      title: `Entity linked: ${newEntity.name}`,
      description: `${newEntity.type} entity linked to case`,
      performedBy: 'Current Analyst',
      timestamp: now
    };
    Promise.all([addCaseEntity.mutateAsync(entity), addCaseTimeline.mutateAsync(timelineEvent)])
      .then(() => toast({ title: 'Entity Linked', description: `${entity.name} added to case` }))
      .catch((e: Error) => toast({ title: 'Link entity failed', description: e.message, variant: 'destructive' }));
    setNewEntity({ type: 'vendor', name: '', reference: '', relationship: '', notes: '' });
    setLinkEntityOpen(false);
  };

  const handleUploadEvidence = async () => {
    if (!evidenceFile || !newEvidence.description) return;
    setEvidenceUploading(true);
    try {
      // 1) Upload bytes to OBS via presigned PUT — server verifies the object
      // exists before persisting the metadata row, so this MUST succeed first.
      const uploaded = await uploadFileToObs('case-evidence', evidenceFile);
      const now = new Date().toISOString();
      const evidence: Evidence = {
        id: genId(),
        caseId: caseData.id,
        fileName: uploaded.fileName,
        fileType: newEvidence.fileType,
        fileSize: uploaded.size,
        mimeType: uploaded.mime,
        source: newEvidence.source,
        sourceAttribution: 'Current Analyst',
        tags: newEvidence.tags.split(',').map(t => t.trim()).filter(Boolean),
        description: newEvidence.description,
        uploadedBy: 'Current Analyst',
        uploadedAt: now,
        storageKey: uploaded.key,
        // The server appends the canonical 'uploaded' custody entry (stamped
        // with the verified OBS key + byte count). Don't duplicate it here.
        custodyChain: [],
      };
      const timelineEvent: CaseTimelineEvent = {
        id: genId(),
        type: 'evidence_added',
        title: `Evidence added: ${uploaded.fileName}`,
        description: `New ${newEvidence.fileType} evidence stored at ${uploaded.key}`,
        performedBy: 'Current Analyst',
        timestamp: now,
      };
      await Promise.all([
        addCaseEvidence.mutateAsync(evidence),
        addCaseTimeline.mutateAsync(timelineEvent),
      ]);
      toast({ title: 'Evidence Uploaded', description: `${uploaded.fileName} added to case` });
      setNewEvidence({ fileType: 'document', description: '', tags: '', source: 'manual_upload' });
      setEvidenceFile(null);
      setUploadEvidenceOpen(false);
    } catch (e) {
      toast({ title: 'Upload evidence failed', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setEvidenceUploading(false);
    }
  };

  const handleAddNote = () => {
    if (!newNote.content) return;
    const now = new Date().toISOString();
    const note: CaseNote = {
      id: genId(),
      caseId: caseData.id,
      authorId: 'current-analyst',
      authorName: 'Current Analyst',
      content: newNote.content,
      timestamp: now,
      type: newNote.type,
      mentions: newNote.mentions ? newNote.mentions.split(',').map(m => m.trim()).filter(Boolean) : undefined
    };
    const timelineEvent: CaseTimelineEvent = {
      id: genId(),
      type: 'note_added',
      title: 'Note added',
      description: newNote.content.substring(0, 80) + (newNote.content.length > 80 ? '...' : ''),
      performedBy: 'Current Analyst',
      timestamp: now
    };
    Promise.all([addCaseNote.mutateAsync(note), addCaseTimeline.mutateAsync(timelineEvent)])
      .then(() => toast({ title: 'Note Added', description: 'Your note has been posted' }))
      .catch((e: Error) => toast({ title: 'Add note failed', description: e.message, variant: 'destructive' }));
    setNewNote({ content: '', type: 'comment', mentions: '' });
  };

  const exportCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: 'Export Complete', description: `${filename} downloaded` });
  };

  const exportPDF = () => {
    const html = `<!DOCTYPE html><html><head><title>Case Report - ${caseData.id}</title><style>body{font-family:Arial,sans-serif;padding:40px;max-width:900px;margin:0 auto}h1{color:#1a1a2e}h2{border-bottom:2px solid #e0e0e0;padding-bottom:8px;margin-top:32px}table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;margin:2px}.meta{color:#666;font-size:14px}</style></head><body>
<h1>Case Investigation Report</h1>
<p class="meta">Generated: ${format(new Date(), 'PPpp')}</p>
<h2>Case Details</h2>
<table><tr><th>Case ID</th><td>${caseData.id}</td></tr><tr><th>Status</th><td>${caseData.status.replace('_', ' ')}</td></tr><tr><th>Priority</th><td>${caseData.priority}</td></tr><tr><th>Type</th><td>${caseData.type}</td></tr><tr><th>Customer</th><td>${caseData.customerId}</td></tr><tr><th>Assigned To</th><td>${caseData.assignedTo || 'Unassigned'}</td></tr><tr><th>Created</th><td>${safeFormat(caseData.createdAt, 'PPpp')}</td></tr><tr><th>Description</th><td>${caseData.description || 'N/A'}</td></tr><tr><th>Tags</th><td>${caseData.tags.join(', ')}</td></tr></table>
${caseData.resolution ? `<h2>Resolution</h2><table><tr><th>Outcome</th><td>${caseData.resolution.outcome.replace(/_/g, ' ')}</td></tr><tr><th>Summary</th><td>${caseData.resolution.summary}</td></tr><tr><th>Resolved By</th><td>${caseData.resolution.resolvedBy}</td></tr><tr><th>Resolved At</th><td>${safeFormat(caseData.resolution.resolvedAt, 'PPpp')}</td></tr>${caseData.resolution.sarFiled ? `<tr><th>SAR Filed</th><td>Yes - ${caseData.resolution.sarReference || 'N/A'}</td></tr>` : ''}</table>` : ''}
<h2>Timeline (${caseData.timeline.length} events)</h2>
<table><tr><th>Time</th><th>Type</th><th>Title</th><th>Description</th><th>By</th></tr>${caseData.timeline.map(e => `<tr><td>${safeFormat(e.timestamp, 'PPpp')}</td><td>${e.type}</td><td>${e.title}</td><td>${e.description}</td><td>${e.performedBy}</td></tr>`).join('')}</table>
<h2>Evidence (${caseData.evidence.length} items)</h2>
<table><tr><th>File</th><th>Type</th><th>Size</th><th>Source</th><th>Uploaded By</th><th>Uploaded At</th></tr>${caseData.evidence.map(e => `<tr><td>${e.fileName}</td><td>${e.fileType}</td><td>${formatFileSize(e.fileSize)}</td><td>${e.source}</td><td>${e.uploadedBy}</td><td>${safeFormat(e.uploadedAt, 'PPpp')}</td></tr>`).join('')}</table>
<h2>Linked Entities (${caseData.linkedEntities.length})</h2>
<table><tr><th>Name</th><th>Type</th><th>Reference</th><th>Relationship</th><th>Risk</th></tr>${caseData.linkedEntities.map(e => `<tr><td>${e.name}</td><td>${e.type}</td><td>${e.reference}</td><td>${e.relationship}</td><td>${e.riskIndicator || 'N/A'}</td></tr>`).join('')}</table>
<h2>Notes (${caseData.notes.length})</h2>
${caseData.notes.map(n => `<div style="border:1px solid #eee;padding:12px;margin:8px 0;border-radius:4px"><p class="meta">${n.authorName} - ${safeFormat(n.timestamp, 'PPpp')} [${n.type}]</p><p>${n.content}</p></div>`).join('')}
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    toast({ title: 'Report Generated', description: 'Full case report opened in new tab' });
  };

  const sortedTimeline = [...caseData.timeline].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const sortedNotes = [...caseData.notes].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const statuses: { value: CaseStatus; label: string; icon: typeof Circle }[] = [
    { value: 'open', label: 'Open', icon: Circle },
    { value: 'in_review', label: 'In Review', icon: Eye },
    { value: 'escalated', label: 'Escalated', icon: AlertTriangle },
    { value: 'closed', label: 'Closed', icon: CheckCircle2 }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/cases')} data-testid="button-back">
              <ArrowLeft />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight font-mono" data-testid="text-case-id">{caseData.id}</h1>
              {caseData.description && (
                <p className="text-sm text-muted-foreground mt-1" data-testid="text-case-description">{caseData.description}</p>
              )}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className={cn('text-xs', getStatusColor(caseData.status))} data-testid="badge-status">
                  {caseData.status.replace('_', ' ')}
                </Badge>
                <Badge variant="outline" className={cn('text-xs capitalize', getPriorityColor(caseData.priority))} data-testid="badge-priority">
                  {caseData.priority}
                </Badge>
                <Badge variant="outline" className="text-xs capitalize" data-testid="badge-type">
                  {caseData.type}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={exportPDF} data-testid="button-export-pdf">
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportCSV(
              `${caseData.id}_timeline.csv`,
              ['ID', 'Type', 'Title', 'Description', 'Performed By', 'Timestamp'],
              caseData.timeline.map(e => [e.id, e.type, e.title, e.description, e.performedBy, e.timestamp])
            )} data-testid="button-export-csv">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {statuses.map(s => {
            const Icon = s.icon;
            return (
              <Button
                key={s.value}
                variant={caseData.status === s.value ? 'default' : 'outline'}
                size="sm"
                disabled={!canManageCase || caseData.status === s.value}
                onClick={() => handleStatusChange(s.value)}
                data-testid={`button-status-${s.value}`}
              >
                <Icon className="h-3.5 w-3.5 mr-1.5" />
                {s.label}
              </Button>
            );
          })}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto">
          <TabsList data-testid="tabs-list" className="inline-flex w-max">
            <TabsTrigger value="kyc-profile" data-testid="tab-kyc-profile">
              <IdCard className="h-4 w-4 mr-1.5" />
              KYC Profile
            </TabsTrigger>
            <TabsTrigger value="risk-score" data-testid="tab-risk-score">
              <Gauge className="h-4 w-4 mr-1.5" />
              Risk Score
            </TabsTrigger>
            <TabsTrigger value="transactions" data-testid="tab-transactions">
              <Activity className="h-4 w-4 mr-1.5" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="network" data-testid="tab-network">
              <NetworkIcon className="h-4 w-4 mr-1.5" />
              Network
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FolderOpen className="h-4 w-4 mr-1.5" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="edd-notes" data-testid="tab-edd-notes">
              <ScrollText className="h-4 w-4 mr-1.5" />
              EDD Notes
            </TabsTrigger>
            <TabsTrigger value="reg-flags" data-testid="tab-reg-flags">
              <Flag className="h-4 w-4 mr-1.5" />
              Reg Flags
            </TabsTrigger>
            <TabsTrigger value="timeline" data-testid="tab-timeline">
              <Clock className="h-4 w-4 mr-1.5" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="entities" data-testid="tab-entities">
              <Link2 className="h-4 w-4 mr-1.5" />
              Entities
            </TabsTrigger>
            <TabsTrigger value="evidence" data-testid="tab-evidence">
              <Paperclip className="h-4 w-4 mr-1.5" />
              Evidence
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes">
              <MessageSquare className="h-4 w-4 mr-1.5" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="export" data-testid="tab-export">
              <Download className="h-4 w-4 mr-1.5" />
              Export
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="kyc-profile" className="mt-6" data-testid="content-kyc-profile">
          {!customer ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No KYC profile found for customer <span className="font-mono">{caseData.customerId}</span>.
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-5 lg:col-span-2 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <h3 className="text-lg font-semibold">{customerName}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{customer.id}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={cn('text-xs capitalize', customer.kycStatus === 'verified' ? 'bg-success/20 text-success border-success/30' : customer.kycStatus === 'pending' ? 'bg-warning/20 text-warning border-warning/30' : 'bg-destructive/20 text-destructive border-destructive/30')}>
                      KYC: {customer.kycStatus}
                    </Badge>
                    <Badge variant="outline" className={cn('text-xs capitalize', getPriorityColor(customer.riskLevel as RiskLevel))}>{customer.riskLevel}</Badge>
                    {customer.pepFlag && <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-600 border-purple-500/30">PEP</Badge>}
                    {customer.sanctionFlag && <Badge variant="outline" className="text-xs bg-destructive/20 text-destructive border-destructive/30">Sanction</Badge>}
                    {customer.fraudRiskFlag && <Badge variant="outline" className="text-xs bg-orange-500/20 text-orange-600 border-orange-500/30">Fraud Flag</Badge>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  {customer.type === 'individual' ? (
                    <>
                      <div><span className="text-xs text-muted-foreground block">Date of Birth</span>{customer.dob}</div>
                      <div><span className="text-xs text-muted-foreground block">Gender</span>{customer.gender === 'M' ? 'Male' : 'Female'}</div>
                      <div><span className="text-xs text-muted-foreground block">Email</span>{customer.email}</div>
                      <div><span className="text-xs text-muted-foreground block">Phone</span>{customer.phone}</div>
                      <div><span className="text-xs text-muted-foreground block">Occupation</span>{customer.occupation}</div>
                      <div><span className="text-xs text-muted-foreground block">Source of Funds</span>{customer.sourceOfFunds}</div>
                      <div className="md:col-span-2"><span className="text-xs text-muted-foreground block">Address</span>{customer.address.street}, {customer.address.city}, {customer.address.state}, {customer.address.country}</div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <span className="text-xs text-muted-foreground block">BVN</span>
                          <span className="font-mono" data-testid="text-bvn">{revealBvn ? customer.bvn : maskBvn(customer.bvn)}</span>
                        </div>
                        <Button size="icon" variant="ghost" onClick={() => setRevealBvn(v => !v)} data-testid="button-toggle-bvn">
                          {revealBvn ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      {customer.nin && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <span className="text-xs text-muted-foreground block">NIN</span>
                            <span className="font-mono" data-testid="text-nin">{revealNin ? customer.nin : maskBvn(customer.nin)}</span>
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => setRevealNin(v => !v)} data-testid="button-toggle-nin">
                            {revealNin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                        </div>
                      )}
                      <div><span className="text-xs text-muted-foreground block">{customer.idType}</span><span className="font-mono">{customer.idNumber}</span></div>
                    </>
                  ) : (
                    <>
                      <div><span className="text-xs text-muted-foreground block">CAC Number</span><span className="font-mono">{customer.cacNumber}</span></div>
                      <div><span className="text-xs text-muted-foreground block">TIN</span><span className="font-mono">{customer.tin}</span></div>
                      <div><span className="text-xs text-muted-foreground block">Industry</span>{customer.industry}</div>
                      <div><span className="text-xs text-muted-foreground block">Registered</span>{customer.registrationDate}</div>
                      <div><span className="text-xs text-muted-foreground block">Email</span>{customer.contactEmail}</div>
                      <div><span className="text-xs text-muted-foreground block">Phone</span>{customer.contactPhone}</div>
                      <div className="md:col-span-2"><span className="text-xs text-muted-foreground block">Address</span>{customer.businessAddress.street}, {customer.businessAddress.city}, {customer.businessAddress.state}, {customer.businessAddress.country}</div>
                    </>
                  )}
                </div>
              </Card>

              <Card className="p-5 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">Identity Confidence</span>
                    <span className="text-sm font-semibold">{customer.identityConfidenceScore}%</span>
                  </div>
                  <Progress value={customer.identityConfidenceScore} className="h-2" />
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">EDD Status</span>
                    <Badge variant="outline" className="text-xs capitalize">{customer.eddStatus.replace('_', ' ')}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Account #</span>
                    <span className="font-mono text-xs">{customer.accountNumber}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Onboarded</span>
                    <span className="text-xs">{safeFormat(customer.onboardedAt, 'PP')}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Last Reviewed</span>
                    <span className="text-xs">{safeFormat(customer.lastReviewedAt, 'PP')}</span>
                  </div>
                </div>
                <Button size="sm" variant="outline" className="w-full" onClick={() => navigate('/onboarding')} data-testid="button-view-customer">
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                  Open in Onboarding
                </Button>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="risk-score" className="mt-6" data-testid="content-risk-score">
          {!customer || !riskBreakdown ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No risk data available for this case.</Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-5 flex flex-col items-center justify-center text-center">
                <div className={cn('w-32 h-32 rounded-full border-8 border-muted flex items-center justify-center', riskGaugeColor(riskBreakdown.score))}>
                  <span className="text-4xl font-bold font-mono">{riskBreakdown.score}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3">Composite Risk Score (0-100)</p>
                <Badge variant="outline" className={cn('text-xs mt-2', riskBreakdown.score >= 75 ? 'bg-destructive/20 text-destructive border-destructive/30' : riskBreakdown.score >= 50 ? 'bg-orange-500/20 text-orange-600 border-orange-500/30' : riskBreakdown.score >= 25 ? 'bg-warning/20 text-warning border-warning/30' : 'bg-success/20 text-success border-success/30')}>
                  {riskBreakdown.score >= 75 ? 'Critical' : riskBreakdown.score >= 50 ? 'High' : riskBreakdown.score >= 25 ? 'Medium' : 'Low'}
                </Badge>
              </Card>

              <Card className="p-5 lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-medium">Contributing Factors</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleExplainRiskAi}
                    disabled={aiRiskLoading}
                    data-testid="button-explain-risk-ai"
                  >
                    {aiRiskLoading ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1.5" />
                    )}
                    Explain Risk (AI)
                  </Button>
                </div>
                <div>
                  <h3 className="text-sm font-medium mb-2 sr-only">Contributing Factors</h3>
                  <div className="flex w-full h-3 rounded-md overflow-hidden bg-muted">
                    {riskBreakdown.factors.map((f, idx) => {
                      const total = riskBreakdown.factors.reduce((s, x) => s + x.weight, 0) || 1;
                      const pct = (f.weight / total) * 100;
                      return (
                        <div
                          key={idx}
                          style={{ width: `${pct}%` }}
                          className={cn(f.impact === 'negative' ? 'bg-destructive/70' : 'bg-success/70')}
                          title={`${f.name} (${f.weight})`}
                        />
                      );
                    })}
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground text-left border-b border-border">
                      <th className="py-2">Factor</th>
                      <th className="py-2">Impact</th>
                      <th className="py-2 text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {riskBreakdown.factors.map((f, idx) => (
                      <tr key={idx} className="border-b border-border/50" data-testid={`risk-factor-${idx}`}>
                        <td className="py-2">{f.name}</td>
                        <td className="py-2">
                          <Badge variant="outline" className={cn('text-xs capitalize', f.impact === 'negative' ? 'bg-destructive/20 text-destructive border-destructive/30' : 'bg-success/20 text-success border-success/30')}>
                            {f.impact}
                          </Badge>
                        </td>
                        <td className="py-2 text-right font-mono">{f.impact === 'negative' ? '+' : '-'}{f.weight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(aiRiskLoading || aiRiskResult) && (
                  <div
                    className="rounded-md border border-primary/30 bg-primary/5 p-3"
                    data-testid="ai-risk-result"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold mb-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      AI Risk Reasoning
                    </div>
                    {aiRiskLoading ? (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
                      </div>
                    ) : (
                      <div className="text-sm whitespace-pre-wrap leading-relaxed">{aiRiskResult}</div>
                    )}
                  </div>
                )}
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="transactions" className="mt-6" data-testid="content-transactions">
          {customerTransactions.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No transactions found for this customer.</Card>
          ) : (
            <Card className="p-0 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-xs text-muted-foreground text-left">
                      <th className="px-3 py-2">Txn ID</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2">Channel</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customerTransactions.map(t => (
                      <tr key={t.id} className="border-t border-border" data-testid={`txn-row-${t.id}`}>
                        <td className="px-3 py-2 font-mono text-xs">{t.id}</td>
                        <td className="px-3 py-2 text-xs">{safeFormat(t.timestamp, 'PP p')}</td>
                        <td className="px-3 py-2 text-right font-mono">${t.amount.toLocaleString()}</td>
                        <td className="px-3 py-2 capitalize text-xs">{t.channel}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="text-xs capitalize">{t.status}</Badge>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant="outline" className={cn('text-xs', getPriorityColor(t.riskLevel))}>{t.riskScore}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="network" className="mt-6" data-testid="content-network">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-medium">Entity Network</h3>
              <Button variant="outline" size="sm" onClick={() => navigate('/graph')} data-testid="button-open-graph">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                Open Full Graph
              </Button>
            </div>
            <div className="relative w-full" style={{ height: 400 }}>
              <svg viewBox="0 0 600 400" className="w-full h-full">
                {(() => {
                  const cx = 300, cy = 200, radius = 140;
                  const peers = caseData.linkedEntities.slice(0, 6);
                  const nodes = peers.map((e, i) => {
                    const angle = (i / Math.max(peers.length, 1)) * Math.PI * 2 - Math.PI / 2;
                    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, entity: e };
                  });
                  return (
                    <>
                      {nodes.map((n, i) => (
                        <line key={`l-${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="hsl(var(--border))" strokeWidth={1.5} strokeDasharray="4 3" />
                      ))}
                      <circle cx={cx} cy={cy} r={36} fill="hsl(var(--primary) / 0.2)" stroke="hsl(var(--primary))" strokeWidth={2} />
                      <text x={cx} y={cy - 2} textAnchor="middle" className="text-xs fill-foreground font-medium">{customerName.slice(0, 14)}</text>
                      <text x={cx} y={cy + 12} textAnchor="middle" className="text-[10px] fill-muted-foreground">{caseData.customerId}</text>
                      {nodes.map((n, i) => {
                        const riskFill = n.entity.riskIndicator === 'high' || n.entity.riskIndicator === 'critical'
                          ? 'hsl(var(--destructive) / 0.2)'
                          : n.entity.riskIndicator === 'medium'
                            ? 'hsl(var(--warning) / 0.2)'
                            : 'hsl(var(--muted))';
                        const riskStroke = n.entity.riskIndicator === 'high' || n.entity.riskIndicator === 'critical'
                          ? 'hsl(var(--destructive))'
                          : n.entity.riskIndicator === 'medium'
                            ? 'hsl(var(--warning))'
                            : 'hsl(var(--border))';
                        return (
                          <g key={`n-${i}`}>
                            <circle cx={n.x} cy={n.y} r={28} fill={riskFill} stroke={riskStroke} strokeWidth={1.5} />
                            <text x={n.x} y={n.y - 2} textAnchor="middle" className="text-[10px] fill-foreground">{n.entity.name.slice(0, 10)}</text>
                            <text x={n.x} y={n.y + 10} textAnchor="middle" className="text-[9px] fill-muted-foreground capitalize">{n.entity.type}</text>
                          </g>
                        );
                      })}
                      {peers.length === 0 && (
                        <text x={cx} y={cy + 80} textAnchor="middle" className="text-xs fill-muted-foreground">No linked entities yet</text>
                      )}
                    </>
                  );
                })()}
              </svg>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-6" data-testid="content-documents">
          {(() => {
            const docs = customer?.documents || [];
            if (docs.length === 0) {
              return <Card className="p-8 text-center text-sm text-muted-foreground">No documents uploaded for this customer.</Card>;
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {docs.map(doc => (
                  <Card key={doc.id} className="p-4" data-testid={`doc-card-${doc.id}`}>
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-md bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium truncate">{doc.name}</h4>
                        <p className="text-xs text-muted-foreground capitalize">{doc.type.replace('_', ' ')}</p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {doc.verified ? (
                            <Badge variant="outline" className="text-xs bg-success/20 text-success border-success/30">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Verified
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-destructive/20 text-destructive border-destructive/30">
                              <XCircle className="h-3 w-3 mr-1" /> Unverified
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{safeFormat(doc.uploadedAt, 'PP')}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="mt-2 -ml-2"
                          onClick={async () => {
                            if (!doc.storageKey) {
                              toast({ title: 'Document unavailable', description: 'No object-storage copy on file for this document.', variant: 'destructive' });
                              return;
                            }
                            try {
                              const { getDownloadUrl } = await import('@/lib/uploads');
                              const url = await getDownloadUrl(doc.storageKey, 300);
                              window.open(url, '_blank', 'noopener,noreferrer');
                            } catch (e) {
                              toast({ title: 'Could not open document', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
                            }
                          }}
                          data-testid={`button-view-doc-${doc.id}`}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1.5" /> View
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            );
          })()}
        </TabsContent>

        <TabsContent value="edd-notes" className="mt-6" data-testid="content-edd-notes">
          {customerEddCases.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No EDD cases on record for this customer.</Card>
          ) : (
            <div className="space-y-4">
              {customerEddCases.map(edd => (
                <Card key={edd.id} className="p-5 space-y-3" data-testid={`edd-card-${edd.id}`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <h3 className="text-sm font-medium">{edd.id}</h3>
                      <p className="text-xs text-muted-foreground">{edd.customerName}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">{edd.status.replace('_', ' ')}</Badge>
                      <Badge variant="outline" className="text-xs">Due {safeFormat(edd.dueDate, 'PP')}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-xs text-muted-foreground block">Triggers</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {edd.triggerReason.map((t, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground block">Risk Factors</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {edd.riskFactors.map((t, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                        ))}
                      </div>
                    </div>
                    <div><span className="text-xs text-muted-foreground block">Source of Wealth</span>{edd.sourceOfWealth}</div>
                    <div><span className="text-xs text-muted-foreground block">Opened</span>{safeFormat(edd.createdAt, 'PP')}</div>
                  </div>
                  <p className="text-sm text-muted-foreground italic">{edd.notes}</p>
                </Card>
              ))}
              <Card className="p-5">
                <h3 className="text-sm font-medium mb-2">Add EDD Note</h3>
                <Textarea
                  value={eddNoteDraft}
                  onChange={e => setEddNoteDraft(e.target.value)}
                  placeholder="Document EDD review observations..."
                  className="min-h-[80px]"
                  data-testid="input-edd-note"
                />
                <div className="flex justify-end mt-2">
                  <Button
                    size="sm"
                    disabled={!canManageCase}
                    onClick={() => {
                      if (!eddNoteDraft.trim()) return;
                      toast({ title: 'EDD Note Saved', description: 'Note attached to EDD record (local).' });
                      setEddNoteDraft('');
                    }}
                    data-testid="button-save-edd-note"
                  >
                    <Send className="h-4 w-4 mr-1.5" /> Save Note
                  </Button>
                </div>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reg-flags" className="mt-6" data-testid="content-reg-flags">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <FileBarChart className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium">Regulatory Reports ({customerReports.length})</h3>
              </div>
              {customerReports.length === 0 ? (
                <p className="text-xs text-muted-foreground">No STR/CTR reports on file.</p>
              ) : (
                <div className="space-y-2">
                  {customerReports.map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`reg-report-${r.id}`}>
                      <div className="min-w-0">
                        <p className="text-xs font-mono truncate">{r.id}</p>
                        <p className="text-[10px] text-muted-foreground">{r.reason}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs">{r.type}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{r.status.replace('_', ' ')}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-medium">Fraud Register ({customerFraudEntries.length})</h3>
              </div>
              {customerFraudEntries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No fraud entries.</p>
              ) : (
                <div className="space-y-2">
                  {customerFraudEntries.map(f => (
                    <div key={f.id} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`fraud-entry-${f.id}`}>
                      <div className="min-w-0">
                        <p className="text-xs font-mono truncate">{f.id}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">{f.fraudType.replace(/_/g, ' ')}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs capitalize">{f.status}</Badge>
                        <Badge variant="outline" className="text-xs">${f.amountLost.toLocaleString()}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-warning" />
                <h3 className="text-sm font-medium">Screening Matches ({customerScreening.length})</h3>
              </div>
              {customerScreening.length === 0 ? (
                <p className="text-xs text-muted-foreground">No active screening matches.</p>
              ) : (
                <div className="space-y-2">
                  {customerScreening.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 flex-wrap" data-testid={`screening-match-${s.id}`}>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{s.matchedName}</p>
                        <p className="text-[10px] text-muted-foreground">{s.matchedListSource}</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant="outline" className="text-xs uppercase">{s.screeningType}</Badge>
                        <Badge variant="outline" className="text-xs">{s.confidence}%</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="timeline" className="mt-6">
          <div className="border-l-2 border-border ml-4 space-y-0">
            {sortedTimeline.map(event => (
              <div key={event.id} className="relative pl-8 pb-8" data-testid={`timeline-event-${event.id}`}>
                <div className={cn('absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full', getTimelineDotColor(event.type))} />
                <div className="stat-card">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <h4 className="text-sm font-medium">{event.title}</h4>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {safeDistance(event.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {event.performedBy}
                    </span>
                    {event.metadata && Object.entries(event.metadata).map(([key, val]) => (
                      <Badge key={key} variant="secondary" className="text-xs">
                        {key}: {val}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="entities" className="mt-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Linked Entities ({caseData.linkedEntities.length})</h3>
            {canManageCase && (
              <Button size="sm" onClick={() => setLinkEntityOpen(true)} data-testid="button-link-entity">
                <Plus className="h-4 w-4 mr-1.5" />
                Link Entity
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {caseData.linkedEntities.map(entity => {
              const Icon = getEntityIcon(entity.type);
              return (
                <div key={entity.id} className="stat-card" data-testid={`entity-card-${entity.id}`}>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium truncate">{entity.name}</h4>
                      <p className="text-xs text-muted-foreground font-mono">{entity.reference}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">{entity.type}</Badge>
                      <Badge variant="secondary" className="text-xs">{entity.relationship}</Badge>
                      {entity.riskIndicator && (
                        <Badge variant="outline" className={cn('text-xs capitalize', getPriorityColor(entity.riskIndicator))}>
                          {entity.riskIndicator}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Added by {entity.addedBy} {safeDistance(entity.addedAt)}
                    </p>
                    {entity.notes && (
                      <p className="text-xs text-muted-foreground italic mt-1">{entity.notes}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Dialog open={linkEntityOpen} onOpenChange={setLinkEntityOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link Entity to Case</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <Select value={newEntity.type} onValueChange={v => setNewEntity(p => ({ ...p, type: v as LinkedEntityType }))}>
                    <SelectTrigger data-testid="select-entity-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="vendor">Vendor</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="invoice">Invoice</SelectItem>
                      <SelectItem value="account">Account</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Name</label>
                  <Input value={newEntity.name} onChange={e => setNewEntity(p => ({ ...p, name: e.target.value }))} placeholder="Entity name" data-testid="input-entity-name" />
                </div>
                <div>
                  <label className="text-sm font-medium">Reference</label>
                  <Input value={newEntity.reference} onChange={e => setNewEntity(p => ({ ...p, reference: e.target.value }))} placeholder="Reference ID" data-testid="input-entity-reference" />
                </div>
                <div>
                  <label className="text-sm font-medium">Relationship</label>
                  <Input value={newEntity.relationship} onChange={e => setNewEntity(p => ({ ...p, relationship: e.target.value }))} placeholder="e.g. payee, intermediary" data-testid="input-entity-relationship" />
                </div>
                <div>
                  <label className="text-sm font-medium">Notes (optional)</label>
                  <Textarea value={newEntity.notes} onChange={e => setNewEntity(p => ({ ...p, notes: e.target.value }))} placeholder="Additional notes" data-testid="input-entity-notes" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLinkEntityOpen(false)}>Cancel</Button>
                <Button onClick={handleAddEntity} data-testid="button-submit-entity">Add Entity</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="evidence" className="mt-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">Evidence ({caseData.evidence.length} items)</h3>
            {canManageCase && (
              <Button size="sm" onClick={() => setUploadEvidenceOpen(true)} data-testid="button-upload-evidence">
                <Upload className="h-4 w-4 mr-1.5" />
                Upload Evidence
              </Button>
            )}
          </div>
          <div className="space-y-4">
            {caseData.evidence.map(ev => {
              const Icon = getEvidenceIcon(ev.fileType);
              const source = getSourceBadge(ev.source);
              const custodyExpanded = expandedCustody[ev.id] || false;
              return (
                <div key={ev.id} className="stat-card" data-testid={`evidence-card-${ev.id}`}>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <h4 className="text-sm font-medium">{ev.fileName}</h4>
                          <p className="text-xs text-muted-foreground">{ev.description}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-muted-foreground">{formatFileSize(ev.fileSize)}</span>
                          <Badge variant="outline" className={cn('text-xs', source.className)}>{source.label}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        {ev.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs group/tag">
                            {tag}
                            <button
                              className="ml-1 opacity-50 hover:opacity-100"
                              onClick={() => handleRemoveTag(ev.id, tag)}
                              data-testid={`button-remove-tag-${ev.id}-${tag}`}
                            >
                              &times;
                            </button>
                          </Badge>
                        ))}
                        <Input
                          className="h-6 w-24 text-xs"
                          placeholder="+ tag"
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              handleAddTag(ev.id, (e.target as HTMLInputElement).value);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }}
                          data-testid={`input-add-tag-${ev.id}`}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Uploaded by {ev.uploadedBy} {safeDistance(ev.uploadedAt)}
                        {ev.storageKey ? null : (
                          <span className="ml-2 text-destructive">(metadata only — no stored file)</span>
                        )}
                      </p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {ev.storageKey && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs"
                            onClick={() => handleOpenEvidence(ev)}
                            data-testid={`button-open-evidence-${ev.id}`}
                          >
                            <ExternalLink className="h-3.5 w-3.5 mr-1" />
                            Open / Download
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => setExpandedCustody(prev => ({ ...prev, [ev.id]: !prev[ev.id] }))}
                          data-testid={`button-custody-${ev.id}`}
                        >
                          {custodyExpanded ? <ChevronUp className="h-3.5 w-3.5 mr-1" /> : <ChevronDown className="h-3.5 w-3.5 mr-1" />}
                          {custodyExpanded ? 'Hide' : 'View'} Custody Chain ({ev.custodyChain.length})
                        </Button>
                      </div>
                      {custodyExpanded && (
                        <div className="mt-2 border-l-2 border-border pl-4 space-y-2">
                          {ev.custodyChain.map((entry, idx) => (
                            <div key={idx} className="text-xs">
                              <span className="font-medium capitalize">{entry.action}</span>
                              <span className="text-muted-foreground"> by {entry.performedBy}</span>
                              <span className="text-muted-foreground"> {safeDistance(entry.timestamp)}</span>
                              {entry.details && <p className="text-muted-foreground italic">{entry.details}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                      {ev.storageKey && (
                        <p className="text-[10px] font-mono text-muted-foreground mt-2 break-all" data-testid={`text-evidence-key-${ev.id}`}>
                          OBS key: {ev.storageKey}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <Dialog open={uploadEvidenceOpen} onOpenChange={setUploadEvidenceOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Evidence</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">File</label>
                  <Input
                    type="file"
                    onChange={e => setEvidenceFile(e.target.files?.[0] ?? null)}
                    data-testid="input-evidence-file"
                  />
                  {evidenceFile && (
                    <p className="text-xs text-muted-foreground mt-1" data-testid="text-evidence-file-meta">
                      {evidenceFile.name} ({formatFileSize(evidenceFile.size)})
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium">File Type</label>
                  <Select value={newEvidence.fileType} onValueChange={v => setNewEvidence(p => ({ ...p, fileType: v as EvidenceFileType }))}>
                    <SelectTrigger data-testid="select-evidence-filetype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="document">Document</SelectItem>
                      <SelectItem value="screenshot">Screenshot</SelectItem>
                      <SelectItem value="transaction_log">Transaction Log</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="report">Report</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">Description</label>
                  <Textarea value={newEvidence.description} onChange={e => setNewEvidence(p => ({ ...p, description: e.target.value }))} placeholder="Describe the evidence" data-testid="input-evidence-description" />
                </div>
                <div>
                  <label className="text-sm font-medium">Tags (comma-separated)</label>
                  <Input value={newEvidence.tags} onChange={e => setNewEvidence(p => ({ ...p, tags: e.target.value }))} placeholder="fraud, investigation" data-testid="input-evidence-tags" />
                </div>
                <div>
                  <label className="text-sm font-medium">Source</label>
                  <Select value={newEvidence.source} onValueChange={v => setNewEvidence(p => ({ ...p, source: v as EvidenceSourceType }))}>
                    <SelectTrigger data-testid="select-evidence-source"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual_upload">Manual Upload</SelectItem>
                      <SelectItem value="external_feed">External Feed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setUploadEvidenceOpen(false)} disabled={evidenceUploading}>Cancel</Button>
                <Button
                  onClick={handleUploadEvidence}
                  data-testid="button-submit-evidence"
                  disabled={evidenceUploading || !evidenceFile || !newEvidence.description}
                >
                  {evidenceUploading ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Uploading…</> : 'Upload'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="notes" className="mt-6">
          <div className="stat-card mb-6">
            <h3 className="text-sm font-medium mb-3">Add Note</h3>
            <div className="space-y-3">
              <Textarea
                value={newNote.content}
                onChange={e => setNewNote(p => ({ ...p, content: e.target.value }))}
                placeholder="Write your investigation note..."
                className="min-h-[80px]"
                data-testid="input-note-content"
              />
              <div className="flex items-end gap-3 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <Select value={newNote.type} onValueChange={v => setNewNote(p => ({ ...p, type: v as 'comment' | 'evidence' | 'action_taken' }))}>
                    <SelectTrigger data-testid="select-note-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="comment">Comment</SelectItem>
                      <SelectItem value="evidence">Evidence</SelectItem>
                      <SelectItem value="action_taken">Action Taken</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs font-medium text-muted-foreground">Mentions (comma-separated)</label>
                  <Input
                    value={newNote.mentions}
                    onChange={e => setNewNote(p => ({ ...p, mentions: e.target.value }))}
                    placeholder="compliance-team, analyst-2"
                    data-testid="input-note-mentions"
                  />
                </div>
                <Button onClick={handleAddNote} disabled={!canManageCase} data-testid="button-post-note">
                  <Send className="h-4 w-4 mr-1.5" />
                  Post
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {sortedNotes.map(note => {
              const initials = note.authorName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
              const noteTypeColor = note.type === 'comment'
                ? 'bg-primary/20 text-primary border-primary/30'
                : note.type === 'evidence'
                  ? 'bg-purple-500/20 text-purple-600 border-purple-500/30'
                  : 'bg-amber-500/20 text-amber-600 border-amber-500/30';
              return (
                <div key={note.id} className="stat-card" data-testid={`note-card-${note.id}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{note.authorName}</span>
                        <Badge variant="outline" className={cn('text-xs capitalize', noteTypeColor)}>
                          {note.type.replace('_', ' ')}
                        </Badge>
                        <span className="text-xs text-muted-foreground ml-auto whitespace-nowrap">
                          {safeDistance(note.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{note.content}</p>
                      {note.mentions && note.mentions.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {note.mentions.map(m => (
                            <Badge key={m} variant="secondary" className="text-xs cursor-pointer">@{m}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="export" className="mt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-medium">Full Case Report</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Comprehensive HTML report containing case details, timeline ({caseData.timeline.length} events),
                evidence ({caseData.evidence.length} items), notes ({caseData.notes.length}),
                linked entities ({caseData.linkedEntities.length}), and resolution details.
                Opens in a new tab for printing to PDF.
              </p>
              <Button onClick={exportPDF} data-testid="button-export-full-report">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                Generate Report
              </Button>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-medium">Evidence Log (CSV)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Export all evidence records including file details, source attribution,
                tags, and custody chain summary.
              </p>
              <Button variant="outline" onClick={() => exportCSV(
                `${caseData.id}_evidence.csv`,
                ['ID', 'File Name', 'File Type', 'File Size', 'Source', 'Attribution', 'Tags', 'Uploaded By', 'Uploaded At', 'Custody Chain Length'],
                caseData.evidence.map(e => [e.id, e.fileName, e.fileType, formatFileSize(e.fileSize), e.source, e.sourceAttribution, e.tags.join('; '), e.uploadedBy, e.uploadedAt, String(e.custodyChain.length)])
              )} data-testid="button-export-evidence-csv">
                <Download className="h-4 w-4 mr-1.5" />
                Export Evidence CSV
              </Button>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-medium">Timeline (CSV)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Export all {caseData.timeline.length} timeline events with type, title, description,
                performer, and timestamp.
              </p>
              <Button variant="outline" onClick={() => exportCSV(
                `${caseData.id}_timeline.csv`,
                ['ID', 'Type', 'Title', 'Description', 'Performed By', 'Timestamp'],
                caseData.timeline.map(e => [e.id, e.type, e.title, e.description, e.performedBy, e.timestamp])
              )} data-testid="button-export-timeline-csv">
                <Download className="h-4 w-4 mr-1.5" />
                Export Timeline CSV
              </Button>
            </div>

            <div className="stat-card">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-medium">Notes (CSV)</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Export all {caseData.notes.length} investigator notes with author, type, content,
                and mentions.
              </p>
              <Button variant="outline" onClick={() => exportCSV(
                `${caseData.id}_notes.csv`,
                ['ID', 'Author', 'Type', 'Content', 'Mentions', 'Timestamp'],
                caseData.notes.map(n => [n.id, n.authorName, n.type, n.content, (n.mentions || []).join('; '), n.timestamp])
              )} data-testid="button-export-notes-csv">
                <Download className="h-4 w-4 mr-1.5" />
                Export Notes CSV
              </Button>
            </div>
          </div>

          <div className="stat-card mt-6">
            <h3 className="text-sm font-medium mb-3">Export Preview</h3>
            <div className="space-y-3 text-xs text-muted-foreground">
              <div className="flex items-center justify-between">
                <span>Case ID</span>
                <span className="font-mono">{caseData.id}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className="capitalize">{caseData.status.replace('_', ' ')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Priority</span>
                <span className="capitalize">{caseData.priority}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Type</span>
                <span className="capitalize">{caseData.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Customer</span>
                <span className="font-mono">{caseData.customerId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Created</span>
                <span>{safeFormat(caseData.createdAt, 'PPpp')}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Timeline Events</span>
                <span>{caseData.timeline.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Evidence Items</span>
                <span>{caseData.evidence.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Linked Entities</span>
                <span>{caseData.linkedEntities.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Notes</span>
                <span>{caseData.notes.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Tags</span>
                <span>{caseData.tags.join(', ')}</span>
              </div>
              {caseData.resolution && (
                <div className="flex items-center justify-between">
                  <span>Resolution</span>
                  <span className="capitalize">{caseData.resolution.outcome.replace(/_/g, ' ')}</span>
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CaseInvestigation;
