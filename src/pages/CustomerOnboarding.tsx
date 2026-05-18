import { useMemo, useState } from 'react';
import { useCustomersQuery, useCreateCustomer, buildCustomerPayloadFromForm } from '@/hooks/use-compliance-api';
import { Loader2, Sparkles } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { analyzeWithAI } from '@/lib/ai';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  UserCheck, Users, Building2, ShieldAlert, AlertTriangle, CheckCircle2,
  Search, Eye, EyeOff, Plus, ChevronRight, ChevronLeft, FileText,
  XCircle, Clock, BadgeCheck, Crown, Ban, RefreshCw, ShieldCheck,
  Upload, Trash2, Image as ImageIcon,
} from 'lucide-react';
import { uploadFileToObs, getDownloadUrl } from '@/lib/uploads';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip,
} from 'recharts';
import {
  computeRiskScore,
  type Customer, type IndividualKyc, type BusinessKyb, type KycStatus, type RiskLevel,
  type KycDocument,
} from '@/lib/compliance-data';

type FilterKyc = 'all' | KycStatus;
type FilterRisk = 'all' | RiskLevel;
type FilterFlag = 'all' | 'pep' | 'sanction' | 'clean';

const kycBadge = (s: KycStatus) => {
  switch (s) {
    case 'verified': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'pending': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'failed': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'rejected': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'expired': return 'bg-muted text-muted-foreground border-border';
  }
};

const riskBadge = (r: RiskLevel) => {
  switch (r) {
    case 'high': return 'bg-red-500/10 text-red-600 border-red-500/20';
    case 'medium': return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'low': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  }
};

const formatNGN = (n: number) => '₦' + n.toLocaleString();

const maskId = (id: string) => id ? id.slice(0, 3) + '*'.repeat(Math.max(0, id.length - 5)) + id.slice(-2) : '';

// ============== Onboarding form schema ==============
const onboardingSchema = z.object({
  type: z.enum(['individual', 'business']),
  fullName: z.string().min(2, 'Required'),
  email: z.string().email('Valid email required'),
  phone: z.string().min(8, 'Required'),
  bvn: z.string().optional(),
  cacNumber: z.string().optional(),
  idType: z.string().optional(),
  idNumber: z.string().optional(),
  documents: z.array(z.object({
    name: z.string(),
    size: z.number(),
    type: z.string(),
    storageKey: z.string().min(1, 'Upload not finished'),
  })).min(1, 'Upload at least one KYC document'),
  sourceOfFunds: z.string().min(1, 'Required'),
  expectedMonthlyVolume: z.coerce.number().min(0, 'Required'),
  notes: z.string().optional(),
});
type OnboardingForm = z.infer<typeof onboardingSchema>;

const STEPS = ['Type', 'Identity', 'Documents', 'Risk Profile', 'Review'] as const;

export default function CustomerOnboarding() {
  const { toast } = useToast();
  const customersQuery = useCustomersQuery();
  const customers = customersQuery.data ?? [];
  const createCustomer = useCreateCustomer();
  const kpis = useMemo(() => ({
    verifiedCustomers: customers.filter(c => c.kycStatus === 'verified').length,
    unverifiedCustomers: customers.filter(c => c.kycStatus !== 'verified').length,
    highRiskCustomers: customers.filter(c => c.riskLevel === 'high').length,
    pepMatches: customers.filter(c => c.pepFlag).length,
    sanctionsMatches: customers.filter(c => c.sanctionFlag).length,
  }), [customers]);

  const [tab, setTab] = useState<'individual' | 'business'>('individual');
  const [search, setSearch] = useState('');
  const [filterKyc, setFilterKyc] = useState<FilterKyc>('all');
  const [filterRisk, setFilterRisk] = useState<FilterRisk>('all');
  const [filterFlag, setFilterFlag] = useState<FilterFlag>('all');
  const [revealIds, setRevealIds] = useState(false);

  const [selected, setSelected] = useState<Customer | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const filtered = useMemo(() => {
    return customers.filter(c => {
      if (c.type !== tab) return false;
      const name = c.type === 'individual' ? c.fullName : c.companyName;
      const email = c.type === 'individual' ? c.email : c.contactEmail;
      const idRef = c.type === 'individual' ? c.bvn : c.cacNumber;
      if (search) {
        const q = search.toLowerCase();
        if (!name.toLowerCase().includes(q)
          && !c.id.toLowerCase().includes(q)
          && !idRef.toLowerCase().includes(q)
          && !c.accountNumber.toLowerCase().includes(q)
          && !email.toLowerCase().includes(q)) return false;
      }
      if (filterKyc !== 'all' && c.kycStatus !== filterKyc) return false;
      if (filterRisk !== 'all' && c.riskLevel !== filterRisk) return false;
      if (filterFlag === 'pep' && !c.pepFlag) return false;
      if (filterFlag === 'sanction' && !c.sanctionFlag) return false;
      if (filterFlag === 'clean' && (c.pepFlag || c.sanctionFlag)) return false;
      return true;
    });
  }, [customers, tab, search, filterKyc, filterRisk, filterFlag]);

  const openDrawer = (c: Customer) => {
    setSelected(c);
    setDrawerOpen(true);
  };

  const handleAction = (action: string) => {
    toast({ title: `${action} action queued`, description: selected ? `For ${selected.type === 'individual' ? selected.fullName : selected.companyName}` : '' });
  };

  // KPI strip
  const kpiCards = [
    { label: 'Verified', value: kpis.verifiedCustomers, icon: BadgeCheck, accent: 'text-emerald-600 bg-emerald-500/10' },
    { label: 'Pending', value: customers.filter(c => c.kycStatus === 'pending').length, icon: Clock, accent: 'text-amber-600 bg-amber-500/10' },
    { label: 'Failed', value: customers.filter(c => c.kycStatus === 'failed' || c.kycStatus === 'rejected').length, icon: XCircle, accent: 'text-red-600 bg-red-500/10' },
    { label: 'High Risk', value: kpis.highRiskCustomers, icon: AlertTriangle, accent: 'text-orange-600 bg-orange-500/10' },
    { label: 'PEP', value: kpis.pepMatches, icon: Crown, accent: 'text-purple-600 bg-purple-500/10' },
    { label: 'Sanctions', value: kpis.sanctionsMatches, icon: Ban, accent: 'text-red-600 bg-red-500/10' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <UserCheck className="h-6 w-6 text-primary" />
            Customer Onboarding
          </h1>
          <p className="text-muted-foreground text-sm">KYC / KYB onboarding, identity verification and risk profiling</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setRevealIds(v => !v)} data-testid="button-toggle-mask">
            {revealIds ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            {revealIds ? 'Mask IDs' : 'Reveal IDs'}
          </Button>
          <Button onClick={() => setNewOpen(true)} data-testid="button-new-onboarding">
            <Plus className="h-4 w-4 mr-1" /> New Onboarding
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <section data-testid="section-kpi-strip">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiCards.map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="stat-card" data-testid={`kpi-${k.label.toLowerCase().replace(/\s/g, '-')}`}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-muted-foreground">{k.label}</p>
                  <div className={cn('p-1.5 rounded', k.accent)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <p className="text-2xl font-bold tracking-tight">{k.value.toLocaleString()}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tabs + table */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'individual' | 'business')}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList>
            <TabsTrigger value="individual" data-testid="tab-individual">
              <Users className="h-4 w-4 mr-1" /> Individuals (KYC)
            </TabsTrigger>
            <TabsTrigger value="business" data-testid="tab-business">
              <Building2 className="h-4 w-4 mr-1" /> Businesses (KYB)
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9 h-9 w-56 text-sm"
                placeholder="Search name, BVN, CAC, account, email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <Select value={filterKyc} onValueChange={(v) => setFilterKyc(v as FilterKyc)}>
              <SelectTrigger className="h-9 w-32 text-xs" data-testid="filter-kyc">
                <SelectValue placeholder="KYC" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All KYC</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterRisk} onValueChange={(v) => setFilterRisk(v as FilterRisk)}>
              <SelectTrigger className="h-9 w-28 text-xs" data-testid="filter-risk">
                <SelectValue placeholder="Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Risk</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterFlag} onValueChange={(v) => setFilterFlag(v as FilterFlag)}>
              <SelectTrigger className="h-9 w-32 text-xs" data-testid="filter-flag">
                <SelectValue placeholder="Flags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Flags</SelectItem>
                <SelectItem value="pep">PEP</SelectItem>
                <SelectItem value="sanction">Sanctions</SelectItem>
                <SelectItem value="clean">Clean</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {customersQuery.isLoading ? (
          <div className="mt-4 stat-card p-12 text-center text-sm text-muted-foreground" data-testid="text-customers-loading">
            Loading customers...
          </div>
        ) : customersQuery.isError ? (
          <div className="mt-4 stat-card p-12 text-center text-sm text-destructive" data-testid="text-customers-error">
            Failed to load customers: {customersQuery.error instanceof Error ? customersQuery.error.message : 'Unknown error'}
          </div>
        ) : customers.length === 0 ? (
          <div className="mt-4 stat-card p-12 text-center text-sm text-muted-foreground" data-testid="text-customers-empty">
            No customers found. Click "New Onboarding" to add one.
          </div>
        ) : (
          <>
            <TabsContent value="individual" className="mt-4">
              <CustomerTable
                customers={filtered.filter((c): c is IndividualKyc => c.type === 'individual')}
                type="individual"
                revealIds={revealIds}
                onRowClick={openDrawer}
              />
            </TabsContent>
            <TabsContent value="business" className="mt-4">
              <CustomerTable
                customers={filtered.filter((c): c is BusinessKyb => c.type === 'business')}
                type="business"
                revealIds={revealIds}
                onRowClick={openDrawer}
              />
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Detail Drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="drawer-customer-detail">
          {selected && (
            <CustomerDetail customer={selected} revealIds={revealIds} onAction={handleAction} />
          )}
        </SheetContent>
      </Sheet>

      {/* New Onboarding multi-step Sheet */}
      <Sheet open={newOpen} onOpenChange={setNewOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="drawer-new-onboarding">
          <NewOnboardingForm
            onClose={() => setNewOpen(false)}
            submitting={createCustomer.isPending}
            onSubmit={(data) => {
              const payload = buildCustomerPayloadFromForm(data);
              createCustomer.mutate(payload, {
                onSuccess: () => {
                  toast({ title: 'Onboarding submitted', description: `${data.fullName} added for review.` });
                  setNewOpen(false);
                },
                onError: (err) => {
                  toast({ title: 'Submission failed', description: err instanceof Error ? err.message : 'Unknown error', variant: 'destructive' });
                },
              });
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ============== Customer Table ==============
function CustomerTable({
  customers, type, revealIds, onRowClick,
}: {
  customers: (IndividualKyc | BusinessKyb)[];
  type: 'individual' | 'business';
  revealIds: boolean;
  onRowClick: (c: Customer) => void;
}) {
  if (customers.length === 0) {
    return (
      <div className="stat-card text-center py-12 text-muted-foreground text-sm" data-testid="empty-state">
        No customers match your filters.
      </div>
    );
  }
  return (
    <div className="stat-card overflow-x-auto p-0">
      <table className="w-full text-xs" data-testid={`table-${type}`}>
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">{type === 'individual' ? 'Name' : 'Company'}</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">ID</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">{type === 'individual' ? 'BVN' : 'CAC'}</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Account</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">KYC</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground w-40">Confidence</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Risk</th>
            <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">Flags</th>
            <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">Last Reviewed</th>
          </tr>
        </thead>
        <tbody>
          {customers.map(c => {
            const name = c.type === 'individual' ? c.fullName : c.companyName;
            const idRef = c.type === 'individual' ? c.bvn : c.cacNumber;
            return (
              <tr
                key={c.id}
                className="border-b border-border/30 hover-elevate cursor-pointer"
                onClick={() => onRowClick(c)}
                data-testid={`row-customer-${c.id}`}
              >
                <td className="py-2 px-3 font-medium">{name}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground">{c.id}</td>
                <td className="py-2 px-3 font-mono">{revealIds ? idRef : maskId(idRef)}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground">{c.accountNumber}</td>
                <td className="py-2 px-3">
                  <Badge variant="outline" className={cn('text-[10px]', kycBadge(c.kycStatus))}>
                    {c.kycStatus}
                  </Badge>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center gap-2">
                    <Progress
                      value={c.identityConfidenceScore}
                      className={cn('h-1.5 flex-1',
                        c.identityConfidenceScore >= 85 ? '[&>div]:bg-emerald-500' :
                        c.identityConfidenceScore >= 65 ? '[&>div]:bg-amber-500' : '[&>div]:bg-red-500')}
                    />
                    <span className="text-[10px] font-mono w-8 text-right">{c.identityConfidenceScore}</span>
                  </div>
                </td>
                <td className="py-2 px-3">
                  <Badge variant="outline" className={cn('text-[10px]', riskBadge(c.riskLevel))}>
                    {c.riskLevel}
                  </Badge>
                </td>
                <td className="py-2 px-3">
                  <div className="flex items-center justify-center gap-1">
                    {c.pepFlag && (
                      <span title="PEP" className="p-1 rounded bg-purple-500/10 text-purple-600">
                        <Crown className="h-3 w-3" />
                      </span>
                    )}
                    {c.sanctionFlag && (
                      <span title="Sanctions" className="p-1 rounded bg-red-500/10 text-red-600">
                        <Ban className="h-3 w-3" />
                      </span>
                    )}
                    {!c.pepFlag && !c.sanctionFlag && (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                </td>
                <td className="py-2 px-3 text-muted-foreground">
                  {format(new Date(c.lastReviewedAt), 'MMM d, yyyy')}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============== Customer Detail ==============
function CustomerDetail({
  customer, revealIds, onAction,
}: {
  customer: Customer;
  revealIds: boolean;
  onAction: (action: string) => void;
}) {
  const { toast } = useToast();
  const risk = computeRiskScore(customer);
  const isInd = customer.type === 'individual';
  const name = isInd ? customer.fullName : customer.companyName;
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string>('');

  const handleSummarizeKyc = async () => {
    setAiOpen(true);
    setAiLoading(true);
    setAiResult('');
    try {
      const result = await analyzeWithAI('kyc_summary', {
        customer: {
          id: customer.id,
          type: customer.type,
          name,
          kycStatus: customer.kycStatus,
          riskLevel: customer.riskLevel,
          identityConfidenceScore: customer.identityConfidenceScore,
          pepFlag: customer.pepFlag,
          sanctionFlag: customer.sanctionFlag,
          eddStatus: customer.eddStatus,
          documents: customer.documents.map(d => ({ name: d.name, type: d.type, verified: d.verified })),
          riskScore: risk.score,
          riskFactors: risk.factors,
        },
      });
      setAiResult(result);
    } catch (err) {
      toast({
        title: 'AI generation failed',
        description: err instanceof Error ? err.message : 'Try again',
        variant: 'destructive',
      });
      setAiOpen(false);
    } finally {
      setAiLoading(false);
    }
  };

  const channelData = isInd
    ? Object.entries(customer.channelUsage).map(([k, v]) => ({ channel: k, value: v }))
    : [
        { channel: 'wire', value: 60 },
        { channel: 'pos', value: 20 },
        { channel: 'web', value: 15 },
        { channel: 'branch', value: 5 },
      ];

  const expectedMonthly = customer.expectedMonthlyVolume;
  const actualMonthly = customer.totalVolume / 12;

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2 flex-wrap" data-testid="text-detail-name">
          {isInd ? <Users className="h-5 w-5 text-primary" /> : <Building2 className="h-5 w-5 text-primary" />}
          {name}
          <Badge variant="outline" className={cn('text-[10px]', kycBadge(customer.kycStatus))}>{customer.kycStatus}</Badge>
          <Badge variant="outline" className={cn('text-[10px]', riskBadge(customer.riskLevel))}>{customer.riskLevel} risk</Badge>
        </SheetTitle>
        <SheetDescription>
          {customer.id} · Account {customer.accountNumber} · Onboarded {format(new Date(customer.onboardedAt), 'MMM d, yyyy')}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5 mt-5">
        {/* Personal / Company info */}
        <section>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{isInd ? 'Personal Details' : 'Company Details'}</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {isInd ? (
              <>
                <DetailRow label="DOB" value={customer.dob} />
                <DetailRow label="Gender" value={customer.gender} />
                <DetailRow label="Phone" value={customer.phone} />
                <DetailRow label="Email" value={customer.email} />
                <DetailRow label="Occupation" value={customer.occupation} />
                <DetailRow label="BVN" value={revealIds ? customer.bvn : maskId(customer.bvn)} mono />
                {customer.nin && <DetailRow label="NIN" value={revealIds ? customer.nin : maskId(customer.nin)} mono />}
                <DetailRow label="ID Type" value={customer.idType} />
                <DetailRow label="ID Number" value={revealIds ? customer.idNumber : maskId(customer.idNumber)} mono />
                <DetailRow label="Address" value={`${customer.address.street}, ${customer.address.city}`} />
              </>
            ) : (
              <>
                <DetailRow label="CAC" value={revealIds ? customer.cacNumber : maskId(customer.cacNumber)} mono />
                <DetailRow label="TIN" value={revealIds ? customer.tin : maskId(customer.tin)} mono />
                <DetailRow label="Industry" value={customer.industry} />
                <DetailRow label="Registered" value={customer.registrationDate} />
                <DetailRow label="Phone" value={customer.contactPhone} />
                <DetailRow label="Email" value={customer.contactEmail} />
                <DetailRow label="Directors" value={String(customer.directors.length)} />
                <DetailRow label="UBOs" value={String(customer.ubos.length)} />
                <DetailRow label="Address" value={`${customer.businessAddress.street}, ${customer.businessAddress.city}`} />
              </>
            )}
          </div>
        </section>

        {/* Documents */}
        <section>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Documents</h4>
          <div className="space-y-1.5">
            {customer.documents.map(doc => (
              <div key={doc.id} className="flex items-center justify-between text-xs p-2 rounded border border-border gap-2" data-testid={`doc-${doc.id}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{doc.name}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">· {format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <DocumentViewButton doc={doc} />
                  {doc.verified ? (
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                      <CheckCircle2 className="h-3 w-3 mr-1" />Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/20">
                      <Clock className="h-3 w-3 mr-1" />Pending
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Identity & face match */}
        {isInd && (
          <section>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Identity Verification</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded border border-border">
                <p className="text-muted-foreground mb-1">Face Match Score</p>
                <p className="text-xl font-bold">{customer.faceMatchScore}%</p>
                <Progress value={customer.faceMatchScore} className="h-1.5 mt-1.5" />
              </div>
              <div className="p-3 rounded border border-border">
                <p className="text-muted-foreground mb-1">Identity Confidence</p>
                <p className="text-xl font-bold">{customer.identityConfidenceScore}%</p>
                <Progress value={customer.identityConfidenceScore} className="h-1.5 mt-1.5" />
              </div>
            </div>
          </section>
        )}

        {/* Channel usage */}
        <section>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Channel Usage</h4>
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={channelData} margin={{ left: -10, right: 5, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="channel" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <RTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 11 }} />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Expected vs Actual */}
        <section>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Expected vs Actual Behavior</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded border border-border">
              <p className="text-muted-foreground">Expected Monthly Volume</p>
              <p className="text-base font-bold">{formatNGN(expectedMonthly)}</p>
            </div>
            <div className="p-3 rounded border border-border">
              <p className="text-muted-foreground">Actual Monthly Avg</p>
              <p className={cn('text-base font-bold', actualMonthly > expectedMonthly * 1.5 ? 'text-red-500' : '')}>
                {formatNGN(Math.round(actualMonthly))}
              </p>
            </div>
            <div className="p-3 rounded border border-border col-span-2">
              <p className="text-muted-foreground">Expected Transaction Types</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {customer.expectedTransactionTypes.map(t => (
                  <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Risk score breakdown */}
        <section>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Risk Score Breakdown</h4>
          <div className="p-3 rounded border border-border">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">Composite Risk Score</span>
              <span className={cn('text-2xl font-bold',
                risk.score >= 75 ? 'text-red-500' :
                risk.score >= 50 ? 'text-amber-500' : 'text-emerald-600')}>{risk.score}</span>
            </div>
            <Progress value={risk.score} className={cn('h-2',
              risk.score >= 75 ? '[&>div]:bg-red-500' :
              risk.score >= 50 ? '[&>div]:bg-amber-500' : '[&>div]:bg-emerald-500')} />
            <div className="mt-3 space-y-1">
              {risk.factors.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{f.name}</span>
                  <span className={cn('font-mono', f.impact === 'negative' ? 'text-red-500' : 'text-emerald-600')}>
                    {f.impact === 'negative' ? '+' : '−'}{f.weight}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* PEP / Sanctions */}
        {(customer.pepFlag || customer.sanctionFlag) && (
          <section>
            <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Screening Matches</h4>
            <div className="space-y-2">
              {customer.pepFlag && (
                <div className="p-3 rounded border border-purple-500/30 bg-purple-500/5 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <Crown className="h-4 w-4 text-purple-600" />
                    <span className="font-semibold">Politically Exposed Person</span>
                  </div>
                  <p className="text-muted-foreground">Domestic PEP registry match. EDD required for transactional onboarding.</p>
                </div>
              )}
              {customer.sanctionFlag && (
                <div className="p-3 rounded border border-red-500/30 bg-red-500/5 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <Ban className="h-4 w-4 text-red-600" />
                    <span className="font-semibold">Sanctions List Hit</span>
                  </div>
                  <p className="text-muted-foreground">Possible match against international sanction list. Block recommended pending review.</p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* EDD status */}
        <section>
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Enhanced Due Diligence</h4>
          <div className="p-3 rounded border border-border flex items-center justify-between text-xs">
            <span className="text-muted-foreground">EDD Status</span>
            <Badge variant="outline" className={cn('text-[10px]',
              customer.eddStatus === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
              customer.eddStatus === 'rejected' ? 'bg-red-500/10 text-red-600 border-red-500/20' :
              customer.eddStatus === 'in_progress' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
              customer.eddStatus === 'required' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
              'bg-muted text-muted-foreground border-border')}>
              {customer.eddStatus.replace('_', ' ')}
            </Badge>
          </div>
        </section>

        {/* Action toolbar */}
        <section className="flex flex-wrap gap-2 pt-2 border-t border-border">
          <Button size="sm" onClick={() => onAction('Approve')} data-testid="action-approve">
            <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('Reject')} data-testid="action-reject">
            <XCircle className="h-4 w-4 mr-1" /> Reject
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('Request EDD')} data-testid="action-request-edd">
            <ShieldAlert className="h-4 w-4 mr-1" /> Request EDD
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('Re-screen')} data-testid="action-rescreen">
            <RefreshCw className="h-4 w-4 mr-1" /> Re-screen
          </Button>
          <Button size="sm" variant="outline" onClick={handleSummarizeKyc} disabled={aiLoading} data-testid="action-summarize-kyc-ai">
            {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
            Summarize KYC (AI)
          </Button>
        </section>
      </div>

      <Dialog open={aiOpen} onOpenChange={setAiOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-ai-kyc-summary">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI KYC Summary — {name}
            </DialogTitle>
            <DialogDescription>{customer.id} · Generated by SnapFort AI</DialogDescription>
          </DialogHeader>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Generating summary…
            </div>
          ) : (
            <div
              className="text-sm whitespace-pre-wrap leading-relaxed max-h-[60vh] overflow-y-auto"
              data-testid="text-ai-kyc-result"
            >
              {aiResult || 'No content returned.'}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col p-2 rounded bg-muted/40">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('text-xs', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

// ============== New Onboarding Form ==============
function NewOnboardingForm({
  onClose, onSubmit, submitting,
}: {
  onClose: () => void;
  onSubmit: (data: OnboardingForm) => void;
  submitting?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  // Stable per-form-instance ID used to scope upload keys before the
  // customer record exists. Folded into the OBS storage key so all docs
  // for this onboarding land under the same prefix.
  const [onboardingSessionId] = useState(
    () => `onboarding-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`,
  );
  const { toast } = useToast();
  const form = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      type: 'individual',
      fullName: '',
      email: '',
      phone: '',
      bvn: '',
      cacNumber: '',
      idType: 'NIN',
      idNumber: '',
      documents: [],
      sourceOfFunds: 'Salary',
      expectedMonthlyVolume: 0,
      notes: '',
    },
  });

  const type = form.watch('type');
  const documents = form.watch('documents') || [];

  const next = async () => {
    let fields: (keyof OnboardingForm)[] = [];
    if (step === 0) fields = ['type'];
    if (step === 1) fields = type === 'individual'
      ? ['fullName', 'email', 'phone', 'bvn', 'idNumber']
      : ['fullName', 'email', 'phone', 'cacNumber'];
    if (step === 2) {
      fields = ['documents'];
      const ok = await form.trigger(fields);
      if (!ok) return;
      const minRequired = type === 'business' ? 2 : 1;
      if (documents.length < minRequired) {
        form.setError('documents', {
          type: 'manual',
          message: type === 'business'
            ? 'Businesses require at least 2 documents (e.g., CAC + MEMART/TIN)'
            : 'Upload at least one KYC document',
        });
        return;
      }
      setStep(s => Math.min(STEPS.length - 1, s + 1));
      return;
    }
    if (step === 3) fields = ['sourceOfFunds', 'expectedMonthlyVolume'];
    const ok = await form.trigger(fields);
    if (ok) setStep(s => Math.min(STEPS.length - 1, s + 1));
  };

  const handleSubmit = (data: OnboardingForm) => {
    onSubmit(data);
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> New Onboarding
        </SheetTitle>
        <SheetDescription>Step {step + 1} of {STEPS.length}: {STEPS[step]}</SheetDescription>
      </SheetHeader>

      {/* Step indicator */}
      <div className="flex items-center gap-1 mt-4">
        {STEPS.map((s, i) => (
          <div key={s} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-muted')} data-testid={`step-indicator-${i}`} />
        ))}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 mt-5">
          {step === 0 && (
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Type</FormLabel>
                  <FormControl>
                    <div className="grid grid-cols-2 gap-3">
                      {(['individual', 'business'] as const).map(t => (
                        <button
                          type="button"
                          key={t}
                          onClick={() => field.onChange(t)}
                          className={cn(
                            'p-4 rounded border text-left hover-elevate',
                            field.value === t ? 'border-primary bg-primary/5' : 'border-border',
                          )}
                          data-testid={`button-type-${t}`}
                        >
                          {t === 'individual' ? <Users className="h-5 w-5 mb-2 text-primary" /> : <Building2 className="h-5 w-5 mb-2 text-primary" />}
                          <p className="font-medium text-sm capitalize">{t}</p>
                          <p className="text-[10px] text-muted-foreground">{t === 'individual' ? 'KYC for individuals' : 'KYB for businesses'}</p>
                        </button>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          {step === 1 && (
            <div className="space-y-3">
              <FormField control={form.control} name="fullName" render={({ field }) => (
                <FormItem>
                  <FormLabel>{type === 'individual' ? 'Full Name' : 'Company Name'}</FormLabel>
                  <FormControl><Input {...field} data-testid="input-fullname" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl><Input type="email" {...field} data-testid="input-email" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="phone" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl><Input {...field} data-testid="input-phone" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              {type === 'individual' ? (
                <>
                  <FormField control={form.control} name="bvn" render={({ field }) => (
                    <FormItem>
                      <FormLabel>BVN</FormLabel>
                      <FormControl><Input {...field} maxLength={11} data-testid="input-bvn" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="idType" render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-id-type"><SelectValue /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="NIN">NIN</SelectItem>
                          <SelectItem value="Passport">Passport</SelectItem>
                          <SelectItem value="DriversLicense">Driver's License</SelectItem>
                          <SelectItem value="VotersCard">Voter's Card</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="idNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID Number</FormLabel>
                      <FormControl><Input {...field} data-testid="input-id-number" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </>
              ) : (
                <FormField control={form.control} name="cacNumber" render={({ field }) => (
                  <FormItem>
                    <FormLabel>CAC Number</FormLabel>
                    <FormControl><Input {...field} placeholder="RC1234567" data-testid="input-cac" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>
          )}

          {step === 2 && (
            <FormField
              control={form.control}
              name="documents"
              render={({ field }) => {
                const docs = (field.value || []) as Array<{ name: string; size: number; type: string; storageKey: string }>;
                const accepted = type === 'individual'
                  ? 'NIN slip, International Passport, Driver\'s Licence, Voter\'s Card, Utility Bill'
                  : 'CAC Certificate, MEMART, TIN Certificate, Proof of Address';
                const minRequired = type === 'business' ? 2 : 1;

                const handleFiles = async (files: FileList | null) => {
                  if (!files || files.length === 0) return;
                  // Upload each file directly to Huawei OBS via a presigned PUT
                  // URL. Only the resulting storage key flows into the form
                  // state — the file bytes never round-trip through our API.
                  const MAX_BYTES = 25 * 1024 * 1024;
                  const oversize = Array.from(files).find(f => f.size > MAX_BYTES);
                  if (oversize) {
                    toast({
                      title: 'File too large',
                      description: `${oversize.name} exceeds the 25 MB upload limit.`,
                      variant: 'destructive',
                    });
                    return;
                  }
                  setUploading(true);
                  try {
                    const uploaded = await Promise.all(
                      Array.from(files).map(async (f) => {
                        const r = await uploadFileToObs(f, 'customer-documents', onboardingSessionId);
                        return { name: r.name, size: r.size, type: r.mime, storageKey: r.storageKey };
                      }),
                    );
                    field.onChange([...docs, ...uploaded]);
                    form.clearErrors('documents');
                  } catch (e) {
                    toast({
                      title: 'Upload failed',
                      description: e instanceof Error ? e.message : 'Could not upload to storage',
                      variant: 'destructive',
                    });
                  } finally {
                    setUploading(false);
                  }
                };

                return (
                  <FormItem>
                    <FormLabel>KYC Documents</FormLabel>
                    <p className="text-[11px] text-muted-foreground">
                      Required: at least {minRequired} document{minRequired > 1 ? 's' : ''}. Accepted: {accepted}.
                    </p>
                    <FormControl>
                      <label
                        htmlFor="kyc-file-input"
                        className={cn(
                          "flex flex-col items-center justify-center gap-2 p-6 rounded border border-dashed border-border hover-elevate text-center",
                          uploading ? "cursor-wait opacity-70" : "cursor-pointer",
                        )}
                        data-testid="dropzone-documents"
                      >
                        {uploading ? (
                          <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
                        ) : (
                          <Upload className="h-6 w-6 text-muted-foreground" />
                        )}
                        <p className="text-sm font-medium">
                          {uploading ? 'Uploading to secure storage…' : 'Click to upload or drag & drop'}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Images or PDF up to 25 MB each. Files are uploaded directly to encrypted object storage.</p>
                        <input
                          id="kyc-file-input"
                          type="file"
                          multiple
                          accept="image/*,application/pdf"
                          className="sr-only"
                          disabled={uploading}
                          onChange={(e) => {
                            handleFiles(e.target.files);
                            e.target.value = '';
                          }}
                          data-testid="input-documents"
                        />
                      </label>
                    </FormControl>

                    {docs.length > 0 && (
                      <div className="space-y-1.5 mt-3" data-testid="list-uploaded-documents">
                        {docs.map((d, i) => {
                          const isImg = d.type.startsWith('image/');
                          const sizeKB = Math.max(1, Math.round(d.size / 1024));
                          return (
                            <div
                              key={`${d.name}-${i}`}
                              className="flex items-center justify-between gap-2 text-xs p-2 rounded border border-border"
                              data-testid={`uploaded-doc-${i}`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {isImg ? (
                                  <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                )}
                                <span className="truncate">{d.name}</span>
                                <span className="text-[10px] text-muted-foreground shrink-0">· {sizeKB} KB</span>
                              </div>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => field.onChange(docs.filter((_, j) => j !== i))}
                                data-testid={`button-remove-doc-${i}`}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <FormMessage />
                  </FormItem>
                );
              }}
            />
          )}

          {step === 3 && (
            <div className="space-y-3">
              <FormField control={form.control} name="sourceOfFunds" render={({ field }) => (
                <FormItem>
                  <FormLabel>Source of Funds</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-source-of-funds"><SelectValue /></SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {['Salary', 'Business Income', 'Investments', 'Inheritance', 'Sale of Property', 'Trading Profits', 'Dividends', 'Consulting Fees'].map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="expectedMonthlyVolume" render={({ field }) => (
                <FormItem>
                  <FormLabel>Expected Monthly Volume (₦)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} data-testid="input-expected-volume" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes (optional)</FormLabel>
                  <FormControl><Textarea rows={3} {...field} data-testid="input-notes" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2 text-sm" data-testid="step-review">
              <h4 className="font-medium">Review</h4>
              <div className="p-3 rounded border border-border space-y-1.5 text-xs">
                {Object.entries(form.getValues())
                  .filter(([k]) => k !== 'documents')
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="font-medium text-right break-all">{String(v) || '—'}</span>
                    </div>
                  ))}
              </div>
              <div className="p-3 rounded border border-border space-y-1.5 text-xs" data-testid="review-documents">
                <p className="text-muted-foreground uppercase text-[10px] tracking-wider">Documents ({documents.length})</p>
                {documents.length === 0 ? (
                  <p className="text-muted-foreground">No documents uploaded.</p>
                ) : (
                  documents.map((d, i) => (
                    <div key={`${d.name}-${i}`} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{d.name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{Math.max(1, Math.round(d.size / 1024))} KB</span>
                    </div>
                  ))
                )}
              </div>
              <p className="text-xs text-muted-foreground">Submitting will create a pending KYC profile for review.</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => step === 0 ? onClose() : setStep(s => s - 1)}
              data-testid="button-back"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> {step === 0 ? 'Cancel' : 'Back'}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" size="sm" onClick={next} disabled={uploading} data-testid="button-next">
                {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button type="submit" size="sm" disabled={submitting} data-testid="button-submit-onboarding">
                {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />} Submit Onboarding
              </Button>
            )}
          </div>
        </form>
      </Form>
    </>
  );
}

// View a KYC document by minting a fresh signed download URL on click. We do
// NOT pre-fetch the URL when listing documents — signed URLs are short-lived
// and one-per-view minimises the chance of leaking a still-valid link.
function DocumentViewButton({ doc }: { doc: KycDocument }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const handleClick = async () => {
    if (!doc.storageKey) {
      toast({ title: 'Document unavailable', description: 'This document predates object storage and has no downloadable copy.', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const url = await getDownloadUrl(doc.storageKey, 300);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      toast({ title: 'Could not open document', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 px-2"
      onClick={handleClick}
      disabled={loading}
      data-testid={`button-view-doc-${doc.id}`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
    </Button>
  );
}
