import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';
import { queryClient, apiRequest } from '@/lib/queryClient';
import {
  BookOpen,
  Plus,
  Search,
  ToggleRight,
  AlertTriangle,
  Shield,
  Play,
  History,
  Wrench,
  Trash2,
  GripVertical,
  ChevronRight,
  Clock,
  Zap,
  Save,
  RotateCcw,
  Activity,
  Ban,
  Bell,
  Eye,
  ArrowUpRight,
  Mail,
  Hash,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import {
  Rule,
  RuleCondition,
  RuleConditionGroup,
  RuleAction,
  RuleActionType,
  RuleType,
  RuleCategory,
  RuleVersion,
  RuleAuditEntry,
  ConditionField,
  ConditionOperator,
  LogicOperator,
  SeverityLevel,
  Transaction,
} from '@/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';

const genId = () =>
  crypto.randomUUID?.() || 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);

const isConditionGroup = (item: RuleCondition | RuleConditionGroup): item is RuleConditionGroup =>
  'logic' in item;

const FIELD_OPTIONS: { value: ConditionField; label: string }[] = [
  { value: 'amount', label: 'Amount' },
  { value: 'risk_score', label: 'Risk Score' },
  { value: 'velocity_count', label: 'Velocity Count' },
  { value: 'country', label: 'Country' },
  { value: 'channel', label: 'Channel' },
  { value: 'merchant_category', label: 'Merchant Category' },
  { value: 'device_id', label: 'Device ID' },
  { value: 'ip_address', label: 'IP Address' },
  { value: 'transaction_type', label: 'Transaction Type' },
  { value: 'time_hour', label: 'Time (Hour)' },
  { value: 'customer_age', label: 'Customer Age' },
  { value: 'anomaly_score', label: 'Anomaly Score' },
];

const OPERATOR_OPTIONS: { value: ConditionOperator; label: string }[] = [
  { value: 'greater_than', label: '>' },
  { value: 'less_than', label: '<' },
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '!=' },
  { value: 'greater_equal', label: '>=' },
  { value: 'less_equal', label: '<=' },
  { value: 'contains', label: 'Contains' },
  { value: 'in', label: 'In' },
  { value: 'not_in', label: 'Not In' },
  { value: 'between', label: 'Between' },
];

const SEVERITY_CONFIG: { value: SeverityLevel; label: string; color: string }[] = [
  { value: 'info', label: 'Info', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  { value: 'low', label: 'Low', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  { value: 'high', label: 'High', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  { value: 'critical', label: 'Critical', color: 'bg-red-500/15 text-red-700 dark:text-red-400' },
];

const ACTION_OPTIONS: { value: RuleActionType; label: string; icon: typeof Zap }[] = [
  { value: 'flag', label: 'Flag', icon: Activity },
  { value: 'block', label: 'Block', icon: Ban },
  { value: 'alert', label: 'Alert', icon: Bell },
  { value: 'escalate', label: 'Escalate', icon: ArrowUpRight },
  { value: 'require_review', label: 'Require Review', icon: Eye },
  { value: 'notify', label: 'Notify', icon: Mail },
];

const NUMERIC_FIELDS: ConditionField[] = ['amount', 'risk_score', 'velocity_count', 'time_hour', 'customer_age', 'anomaly_score'];

function getTransactionFieldValue(tx: Transaction, field: ConditionField): string | number {
  switch (field) {
    case 'amount': return tx.amount;
    case 'risk_score': return tx.riskScore;
    case 'country': return tx.geoLocation.country;
    case 'channel': return tx.channel;
    case 'transaction_type': return tx.type;
    case 'anomaly_score': return tx.anomalyScore;
    case 'time_hour': return new Date(tx.timestamp).getHours();
    case 'velocity_count': {
      const hash = tx.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return (hash % 12) + 1;
    }
    case 'merchant_category': return tx.merchantCategoryCode;
    case 'device_id': return tx.deviceId;
    case 'ip_address': return tx.ipAddress;
    case 'customer_age': {
      const h = tx.customerId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
      return (h % 60) + 18;
    }
    default: return 0;
  }
}

function evaluateCondition(cond: RuleCondition, tx: Transaction): boolean {
  const fieldVal = getTransactionFieldValue(tx, cond.field);
  const val = cond.value;
  const numField = typeof fieldVal === 'number' ? fieldVal : parseFloat(String(fieldVal));
  const numVal = typeof val === 'number' ? val : parseFloat(String(val));

  switch (cond.operator) {
    case 'greater_than': return numField > numVal;
    case 'less_than': return numField < numVal;
    case 'equals': return String(fieldVal) === String(val);
    case 'not_equals': return String(fieldVal) !== String(val);
    case 'greater_equal': return numField >= numVal;
    case 'less_equal': return numField <= numVal;
    case 'contains': return String(fieldVal).toLowerCase().includes(String(val).toLowerCase());
    case 'in': {
      const list = String(val).split(',').map(s => s.trim().toLowerCase());
      return list.includes(String(fieldVal).toLowerCase());
    }
    case 'not_in': {
      const list2 = String(val).split(',').map(s => s.trim().toLowerCase());
      return !list2.includes(String(fieldVal).toLowerCase());
    }
    case 'between': {
      const sec = typeof cond.secondaryValue === 'number' ? cond.secondaryValue : parseFloat(String(cond.secondaryValue ?? 0));
      return numField >= numVal && numField <= sec;
    }
    default: return false;
  }
}

function evaluateGroup(group: RuleConditionGroup, tx: Transaction): boolean {
  if (group.conditions.length === 0) return true;
  if (group.logic === 'AND') {
    return group.conditions.every(item =>
      isConditionGroup(item) ? evaluateGroup(item, tx) : evaluateCondition(item, tx)
    );
  }
  return group.conditions.some(item =>
    isConditionGroup(item) ? evaluateGroup(item, tx) : evaluateCondition(item, tx)
  );
}

function createEmptyCondition(): RuleCondition {
  return { id: genId(), field: 'amount', operator: 'greater_than', value: 0 };
}

function createEmptyGroup(): RuleConditionGroup {
  return { id: genId(), logic: 'AND', conditions: [createEmptyCondition()] };
}

function createEmptyRule(): Omit<Rule, 'id' | 'createdAt' | 'updatedAt' | 'triggeredCount' | 'versions' | 'auditLog' | 'currentVersion'> {
  return {
    name: '',
    description: '',
    type: 'amount',
    category: 'fraud',
    condition: '',
    threshold: 0,
    priority: 2,
    isActive: true,
    severity: 'medium',
    conditionGroup: createEmptyGroup(),
    actions: [{ type: 'flag' }],
  };
}

const Rules = () => {
  const { toast } = useToast();
  const { can } = usePermissions();
  const canCreateRules = can('create_rules');
  const canEditRules = can('edit_rules');
  const canSimulateRules = can('simulate_rules');
  const { data: rulesData, isLoading: rulesLoading } = useQuery<Rule[]>({ queryKey: ['/api/rules'] });
  const rules: Rule[] = useMemo(() => (rulesData ?? []).map(r => ({
    ...r,
    versions: (r.versions ?? []) as RuleVersion[],
    auditLog: (r.auditLog ?? []) as RuleAuditEntry[],
    actions: (r.actions ?? []) as RuleAction[],
    conditionGroup: (r.conditionGroup ?? createEmptyGroup()) as RuleConditionGroup,
  })), [rulesData]);
  const setRulesLocal = useCallback((updater: (prev: Rule[]) => Rule[]) => {
    queryClient.setQueryData<Rule[]>(['/api/rules'], (old) => updater((old ?? []) as Rule[]));
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'fraud' | 'aml'>('all');
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [activeTab, setActiveTab] = useState('builder');

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<RuleType>('amount');
  const [editCategory, setEditCategory] = useState<RuleCategory>('fraud');
  const [editSeverity, setEditSeverity] = useState<SeverityLevel>('medium');
  const [editConditionGroup, setEditConditionGroup] = useState<RuleConditionGroup>(createEmptyGroup());
  const [editActions, setEditActions] = useState<RuleAction[]>([{ type: 'flag' }]);

  const [simResults, setSimResults] = useState<{
    total: number;
    matches: number;
    percentage: number;
    sampleMatches: Transaction[];
  } | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  const filteredRules = useMemo(() => {
    let result = rules;
    if (categoryFilter !== 'all') {
      result = result.filter(r => r.category === categoryFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rules, categoryFilter, searchQuery]);

  const selectedRule = useMemo(
    () => (selectedRuleId ? rules.find(r => r.id === selectedRuleId) ?? null : null),
    [rules, selectedRuleId]
  );

  const loadRuleIntoEditor = useCallback((rule: Rule) => {
    setEditName(rule.name);
    setEditDescription(rule.description);
    setEditType(rule.type);
    setEditCategory(rule.category);
    setEditSeverity(rule.severity);
    setEditConditionGroup(JSON.parse(JSON.stringify(rule.conditionGroup)));
    setEditActions(JSON.parse(JSON.stringify(rule.actions)));
    setSimResults(null);
  }, []);

  const selectRule = useCallback((rule: Rule) => {
    setSelectedRuleId(rule.id);
    setIsCreating(false);
    loadRuleIntoEditor(rule);
    setActiveTab('builder');
  }, [loadRuleIntoEditor]);

  const startCreating = useCallback(() => {
    setSelectedRuleId(null);
    setIsCreating(true);
    const empty = createEmptyRule();
    setEditName(empty.name);
    setEditDescription(empty.description);
    setEditType(empty.type);
    setEditCategory(empty.category);
    setEditSeverity(empty.severity);
    setEditConditionGroup(JSON.parse(JSON.stringify(empty.conditionGroup)));
    setEditActions(JSON.parse(JSON.stringify(empty.actions)));
    setSimResults(null);
    setActiveTab('builder');
  }, []);

  const toggleMutation = useMutation({
    mutationFn: async (vars: { ruleId: string; rule: Rule }) => {
      const newActive = !vars.rule.isActive;
      const entry: RuleAuditEntry = {
        id: genId(),
        action: newActive ? 'activated' : 'deactivated',
        performedBy: 'analyst-1',
        timestamp: new Date().toISOString(),
        details: newActive ? 'Rule activated' : 'Rule deactivated',
      };
      return await apiRequest<Rule>('PATCH', `/api/rules/${vars.ruleId}`, {
        isActive: newActive,
        auditLog: [...vars.rule.auditLog, entry],
      });
    },
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ['/api/rules'] });
      const prev = queryClient.getQueryData<Rule[]>(['/api/rules']);
      setRulesLocal(prevRules => prevRules.map(r => r.id === vars.ruleId ? { ...r, isActive: !r.isActive } : r));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['/api/rules'], ctx.prev);
      toast({ title: 'Toggle failed', description: 'Could not update rule status', variant: 'destructive' });
    },
    onSettled: () => { queryClient.invalidateQueries({ queryKey: ['/api/rules'] }); },
  });

  const toggleRule = useCallback((ruleId: string, e?: { stopPropagation: () => void }) => {
    e?.stopPropagation();
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    toggleMutation.mutate({ ruleId, rule });
  }, [rules, toggleMutation]);

  const createMutation = useMutation({
    mutationFn: async (rule: Rule) => apiRequest<Rule>('POST', '/api/rules', rule),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['/api/rules'] });
      setSelectedRuleId(created.id);
      setIsCreating(false);
      toast({ title: 'Rule Created', description: `"${created.name}" has been created successfully` });
    },
    onError: (e) => {
      toast({ title: 'Create failed', description: (e as Error).message, variant: 'destructive' });
    },
  });

  const versionMutation = useMutation({
    mutationFn: async (vars: { ruleId: string; payload: Record<string, unknown>; newVersion: number }) =>
      apiRequest<Rule>('POST', `/api/rules/${vars.ruleId}/versions`, vars.payload),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['/api/rules'] });
      toast({ title: 'Rule Updated', description: `"${editName}" saved as version ${vars.newVersion}` });
    },
    onError: (e) => {
      toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' });
    },
  });

  const handleSave = useCallback(() => {
    if (!editName.trim()) {
      toast({ title: 'Validation Error', description: 'Rule name is required', variant: 'destructive' });
      return;
    }

    const now = new Date().toISOString();
    const conditionSummary = summarizeGroup(editConditionGroup);

    if (isCreating) {
      const newRule: Rule = {
        id: `RULE-${genId().slice(0, 8).toUpperCase()}`,
        name: editName,
        description: editDescription,
        type: editType,
        category: editCategory,
        severity: editSeverity,
        conditionGroup: JSON.parse(JSON.stringify(editConditionGroup)),
        actions: JSON.parse(JSON.stringify(editActions)),
        condition: conditionSummary,
        threshold: 0,
        priority: editSeverity === 'critical' ? 1 : editSeverity === 'high' ? 1 : editSeverity === 'medium' ? 2 : 3,
        isActive: true,
        createdAt: now,
        updatedAt: now,
        triggeredCount: 0,
        currentVersion: 1,
        versions: [{
          version: 1,
          conditionGroup: JSON.parse(JSON.stringify(editConditionGroup)),
          actions: JSON.parse(JSON.stringify(editActions)),
          severity: editSeverity,
          changedBy: 'analyst-1',
          changedAt: now,
          changeNote: 'Initial rule creation',
        }],
        auditLog: [{
          id: genId(),
          action: 'created',
          performedBy: 'analyst-1',
          timestamp: now,
          details: `Rule "${editName}" created`,
        }],
      };
      createMutation.mutate(newRule);
    } else if (selectedRule) {
      const newVersion = selectedRule.currentVersion + 1;
      versionMutation.mutate({
        ruleId: selectedRule.id,
        newVersion,
        payload: {
          name: editName,
          description: editDescription,
          type: editType,
          category: editCategory,
          severity: editSeverity,
          condition: conditionSummary,
          conditionGroup: JSON.parse(JSON.stringify(editConditionGroup)),
          actions: JSON.parse(JSON.stringify(editActions)),
          changedBy: 'analyst-1',
          changeNote: `Updated rule configuration (v${newVersion})`,
        },
      });
    }
  }, [editName, editDescription, editType, editCategory, editSeverity, editConditionGroup, editActions, isCreating, selectedRule, toast, createMutation, versionMutation]);

  const simulateMutation = useMutation({
    mutationFn: async (vars: { ruleId: string | null; sampleSize: number; matchCount: number; hitRate: number; sampleMatches: unknown; conditionGroup: unknown }) => {
      const id = vars.ruleId ?? '__draft__';
      return apiRequest('POST', `/api/rules/${id}/simulate`, {
        sampleSize: vars.sampleSize,
        matchCount: vars.matchCount,
        hitRate: vars.hitRate,
        sampleMatches: vars.sampleMatches,
        conditionGroup: vars.conditionGroup,
        performedBy: 'analyst-1',
      });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/rules'] }); },
  });

  const runSimulation = useCallback(async () => {
    setSimRunning(true);
    try {
      const res = await fetch('/api/transactions/sample?size=500', { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      const raw = (await res.json()) as Array<Transaction & { geoLocation: Transaction['geoLocation'] | null }>;
      const fallbackGeo = { latitude: 0, longitude: 0, country: 'Nigeria', city: 'Lagos' };
      const transactions: Transaction[] = raw.map(t => ({
        ...t,
        geoLocation: t.geoLocation ?? fallbackGeo,
      }));
      if (transactions.length === 0) {
        setSimResults({ total: 0, matches: 0, percentage: 0, sampleMatches: [] });
        toast({ title: 'No transactions available', description: 'Could not draw a sample for simulation.' });
        return;
      }
      const matches = transactions.filter(tx => evaluateGroup(editConditionGroup, tx));
      const hitRate = (matches.length / transactions.length) * 100;
      setSimResults({
        total: transactions.length,
        matches: matches.length,
        percentage: hitRate,
        sampleMatches: matches.slice(0, 5),
      });
      simulateMutation.mutate({
        ruleId: selectedRule?.id ?? null,
        sampleSize: transactions.length,
        matchCount: matches.length,
        hitRate,
        sampleMatches: matches.slice(0, 5),
        conditionGroup: editConditionGroup,
      });
    } catch (err) {
      toast({
        title: 'Simulation failed',
        description: err instanceof Error ? err.message : 'Could not load transaction sample.',
        variant: 'destructive',
      });
    } finally {
      setSimRunning(false);
    }
  }, [editConditionGroup, selectedRule, simulateMutation, toast]);

  const restoreVersion = useCallback((version: RuleVersion) => {
    setEditConditionGroup(JSON.parse(JSON.stringify(version.conditionGroup)));
    setEditActions(JSON.parse(JSON.stringify(version.actions)));
    setEditSeverity(version.severity);
    setActiveTab('builder');
    toast({ title: 'Version Restored', description: `Restored to version ${version.version}. Save to apply.` });
  }, [toast]);

  const updateConditionInGroup = useCallback((
    group: RuleConditionGroup,
    condId: string,
    updater: (c: RuleCondition) => RuleCondition
  ): RuleConditionGroup => {
    return {
      ...group,
      conditions: group.conditions.map(item => {
        if (isConditionGroup(item)) {
          return updateConditionInGroup(item, condId, updater);
        }
        return item.id === condId ? updater(item) : item;
      }),
    };
  }, []);

  const removeFromGroup = useCallback((
    group: RuleConditionGroup,
    itemId: string
  ): RuleConditionGroup => {
    return {
      ...group,
      conditions: group.conditions
        .filter(item => item.id !== itemId)
        .map(item => isConditionGroup(item) ? removeFromGroup(item, itemId) : item),
    };
  }, []);

  const addConditionToGroup = useCallback((groupId: string) => {
    const addToGroup = (g: RuleConditionGroup): RuleConditionGroup => {
      if (g.id === groupId) {
        return { ...g, conditions: [...g.conditions, createEmptyCondition()] };
      }
      return {
        ...g,
        conditions: g.conditions.map(item => isConditionGroup(item) ? addToGroup(item) : item),
      };
    };
    setEditConditionGroup(prev => addToGroup(prev));
  }, []);

  const addNestedGroup = useCallback((groupId: string) => {
    const addToGroup = (g: RuleConditionGroup): RuleConditionGroup => {
      if (g.id === groupId) {
        return { ...g, conditions: [...g.conditions, createEmptyGroup()] };
      }
      return {
        ...g,
        conditions: g.conditions.map(item => isConditionGroup(item) ? addToGroup(item) : item),
      };
    };
    setEditConditionGroup(prev => addToGroup(prev));
  }, []);

  const toggleGroupLogic = useCallback((groupId: string) => {
    const toggle = (g: RuleConditionGroup): RuleConditionGroup => {
      if (g.id === groupId) {
        return { ...g, logic: g.logic === 'AND' ? 'OR' : 'AND' };
      }
      return {
        ...g,
        conditions: g.conditions.map(item => isConditionGroup(item) ? toggle(item) : item),
      };
    };
    setEditConditionGroup(prev => toggle(prev));
  }, []);

  const reorderConditions = useCallback((groupId: string, fromIdx: number, toIdx: number) => {
    const reorder = (g: RuleConditionGroup): RuleConditionGroup => {
      if (g.id === groupId) {
        const items = [...g.conditions];
        const [moved] = items.splice(fromIdx, 1);
        items.splice(toIdx, 0, moved);
        return { ...g, conditions: items };
      }
      return {
        ...g,
        conditions: g.conditions.map(item => isConditionGroup(item) ? reorder(item) : item),
      };
    };
    setEditConditionGroup(prev => reorder(prev));
  }, []);

  const hasEditor = isCreating || selectedRule !== null;

  const severityBadge = (sev: SeverityLevel) => {
    const cfg = SEVERITY_CONFIG.find(s => s.value === sev)!;
    return <Badge variant="outline" className={cn('text-xs capitalize no-default-hover-elevate no-default-active-elevate', cfg.color)}>{cfg.label}</Badge>;
  };

  const actionIcon = (type: RuleActionType) => {
    const opt = ACTION_OPTIONS.find(a => a.value === type);
    if (!opt) return null;
    const Icon = opt.icon;
    return <Icon className="h-3.5 w-3.5" />;
  };

  const conditionSummaryText = (cond: RuleCondition) => {
    const fieldLabel = FIELD_OPTIONS.find(f => f.value === cond.field)?.label ?? cond.field;
    const opLabel = OPERATOR_OPTIONS.find(o => o.value === cond.operator)?.label ?? cond.operator;
    const val = cond.operator === 'between'
      ? `${cond.value} - ${cond.secondaryValue ?? '?'}`
      : String(cond.value);
    return `${fieldLabel} ${opLabel} ${val}`;
  };

  const summarizeGroup = (group: RuleConditionGroup): string => {
    const parts = group.conditions.map(item => {
      if (isConditionGroup(item)) return `(${summarizeGroup(item)})`;
      return conditionSummaryText(item);
    });
    return parts.join(` ${group.logic} `);
  };

  const ConditionBlockRenderer = ({
    group,
    depth = 0,
  }: {
    group: RuleConditionGroup;
    depth?: number;
  }) => {
    const groupDragRef = useRef<number | null>(null);
    const [localDropTarget, setLocalDropTarget] = useState<number | null>(null);

    return (
      <div className={cn(
        'rounded-md p-3 space-y-3',
        depth === 0 ? 'border border-border' : 'border-l-2 border-l-purple-400 dark:border-l-purple-600 pl-4 ml-2',
      )}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Match</span>
          <div className="flex gap-0.5">
            <Button
              size="sm"
              variant={group.logic === 'AND' ? 'default' : 'outline'}
              onClick={() => toggleGroupLogic(group.id)}
              data-testid={`logic-and-${group.id}`}
            >
              AND
            </Button>
            <Button
              size="sm"
              variant={group.logic === 'OR' ? 'default' : 'outline'}
              onClick={() => toggleGroupLogic(group.id)}
              data-testid={`logic-or-${group.id}`}
            >
              OR
            </Button>
          </div>
          <span className="text-xs text-muted-foreground">of the following conditions</span>
        </div>

        <div className="space-y-2">
          {group.conditions.map((item, idx) => {
            if (isConditionGroup(item)) {
              return (
                <div key={item.id} className="relative">
                  <div className="flex items-start gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-1 shrink-0 text-destructive"
                      onClick={() => {
                        setEditConditionGroup(prev => removeFromGroup(prev, item.id));
                      }}
                      data-testid={`remove-group-${item.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <div className="flex-1">
                      <ConditionBlockRenderer group={item} depth={depth + 1} />
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                draggable
                onDragStart={() => { groupDragRef.current = idx; }}
                onDragOver={(e) => { e.preventDefault(); setLocalDropTarget(idx); }}
                onDragLeave={() => setLocalDropTarget(null)}
                onDrop={() => {
                  if (groupDragRef.current !== null && groupDragRef.current !== idx) {
                    reorderConditions(group.id, groupDragRef.current, idx);
                  }
                  groupDragRef.current = null;
                  setLocalDropTarget(null);
                }}
                className={cn(
                  'flex items-start gap-2 rounded-md p-2 border-l-2 border-l-blue-400 dark:border-l-blue-600 bg-muted/30 transition-colors',
                  localDropTarget === idx && 'ring-2 ring-primary/40',
                )}
                data-testid={`condition-block-${item.id}`}
              >
                <div className="cursor-grab mt-1.5 text-muted-foreground shrink-0">
                  <GripVertical className="h-4 w-4" />
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  <Select
                    value={item.field}
                    onValueChange={(v) => setEditConditionGroup(prev =>
                      updateConditionInGroup(prev, item.id, c => ({ ...c, field: v as ConditionField }))
                    )}
                  >
                    <SelectTrigger data-testid={`field-select-${item.id}`}>
                      <SelectValue placeholder="Field" />
                    </SelectTrigger>
                    <SelectContent>
                      {FIELD_OPTIONS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={item.operator}
                    onValueChange={(v) => setEditConditionGroup(prev =>
                      updateConditionInGroup(prev, item.id, c => ({ ...c, operator: v as ConditionOperator }))
                    )}
                  >
                    <SelectTrigger data-testid={`operator-select-${item.id}`}>
                      <SelectValue placeholder="Operator" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPERATOR_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Input
                    type={NUMERIC_FIELDS.includes(item.field) ? 'number' : 'text'}
                    value={String(item.value)}
                    onChange={(e) => {
                      const val = NUMERIC_FIELDS.includes(item.field) ? parseFloat(e.target.value) || 0 : e.target.value;
                      setEditConditionGroup(prev =>
                        updateConditionInGroup(prev, item.id, c => ({ ...c, value: val }))
                      );
                    }}
                    placeholder="Value"
                    data-testid={`value-input-${item.id}`}
                  />

                  {item.operator === 'between' && (
                    <Input
                      type="number"
                      value={String(item.secondaryValue ?? '')}
                      onChange={(e) => setEditConditionGroup(prev =>
                        updateConditionInGroup(prev, item.id, c => ({ ...c, secondaryValue: parseFloat(e.target.value) || 0 }))
                      )}
                      placeholder="Upper bound"
                      data-testid={`secondary-value-${item.id}`}
                    />
                  )}

                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      className="w-16"
                      value={item.timeWindow?.value ?? ''}
                      onChange={(e) => {
                        const v = parseInt(e.target.value) || 0;
                        setEditConditionGroup(prev =>
                          updateConditionInGroup(prev, item.id, c => ({
                            ...c,
                            timeWindow: v > 0 ? { value: v, unit: c.timeWindow?.unit ?? 'hours' } : undefined,
                          }))
                        );
                      }}
                      placeholder="Win"
                      data-testid={`timewindow-value-${item.id}`}
                    />
                    {(item.timeWindow?.value ?? 0) > 0 && (
                      <Select
                        value={item.timeWindow?.unit ?? 'hours'}
                        onValueChange={(v) => setEditConditionGroup(prev =>
                          updateConditionInGroup(prev, item.id, c => ({
                            ...c,
                            timeWindow: { value: c.timeWindow?.value ?? 1, unit: v as 'minutes' | 'hours' | 'days' },
                          }))
                        )}
                      >
                        <SelectTrigger className="w-24" data-testid={`timewindow-unit-${item.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="minutes">Min</SelectItem>
                          <SelectItem value="hours">Hours</SelectItem>
                          <SelectItem value="days">Days</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  <Select
                    value={item.entityScope ?? '_none'}
                    onValueChange={(v) => setEditConditionGroup(prev =>
                      updateConditionInGroup(prev, item.id, c => ({
                        ...c,
                        entityScope: v === '_none' ? undefined : v as RuleCondition['entityScope'],
                      }))
                    )}
                  >
                    <SelectTrigger data-testid={`entity-scope-${item.id}`}>
                      <SelectValue placeholder="Scope" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No scope</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="merchant">Merchant</SelectItem>
                      <SelectItem value="device">Device</SelectItem>
                      <SelectItem value="ip">IP</SelectItem>
                      <SelectItem value="account">Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive mt-0.5"
                  onClick={() => setEditConditionGroup(prev => removeFromGroup(prev, item.id))}
                  data-testid={`remove-condition-${item.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => addConditionToGroup(group.id)}
            data-testid={`add-condition-${group.id}`}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Condition
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => addNestedGroup(group.id)}
            data-testid={`add-group-${group.id}`}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Group
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-primary" />
            Rule Engine Builder
          </h1>
          <p className="text-muted-foreground">Configure and test fraud and AML detection rules</p>
        </div>
        {canCreateRules && (
          <Button onClick={startCreating} data-testid="button-create-rule">
            <Plus className="h-4 w-4 mr-1" />
            Create Rule
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <BookOpen className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="text-total-rules">{rules.length}</p>
              <p className="text-xs text-muted-foreground">Total Rules</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-emerald-500/10">
              <ToggleRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="text-active-rules">{rules.filter(r => r.isActive).length}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-amber-500/10">
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="text-fraud-rules">{rules.filter(r => r.category === 'fraud').length}</p>
              <p className="text-xs text-muted-foreground">Fraud Rules</p>
            </div>
          </div>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-blue-500/10">
              <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-xl font-bold" data-testid="text-aml-rules">{rules.filter(r => r.category === 'aml').length}</p>
              <p className="text-xs text-muted-foreground">AML Rules</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4" style={{ minHeight: '600px' }}>
        <div className="lg:col-span-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search rules..."
              className="pl-9"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search-rules"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {(['all', 'fraud', 'aml'] as const).map(cat => (
              <Button
                key={cat}
                variant={categoryFilter === cat ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategoryFilter(cat)}
                className="capitalize"
                data-testid={`button-filter-${cat}`}
              >
                {cat === 'all' ? 'All' : cat.toUpperCase()}
              </Button>
            ))}
          </div>

          <ScrollArea className="h-[520px]">
            <div className="space-y-2 pr-2">
              {filteredRules.map(rule => (
                <Card
                  key={rule.id}
                  className={cn(
                    'p-3 cursor-pointer transition-colors hover-elevate',
                    selectedRuleId === rule.id && !isCreating && 'ring-2 ring-primary',
                    !rule.isActive && 'opacity-60',
                  )}
                  onClick={() => selectRule(rule)}
                  data-testid={`card-rule-${rule.id}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-tight">{rule.name}</h3>
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={() => toggleRule(rule.id)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={!canEditRules}
                        data-testid={`switch-rule-${rule.id}`}
                      />
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize no-default-hover-elevate no-default-active-elevate">{rule.type}</Badge>
                      <Badge variant="secondary" className="text-xs uppercase no-default-hover-elevate no-default-active-elevate">{rule.category}</Badge>
                      {severityBadge(rule.severity)}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{rule.condition || summarizeGroup(rule.conditionGroup)}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {rule.triggeredCount.toLocaleString()} triggered
                      </span>
                      <span>v{rule.currentVersion}</span>
                    </div>
                  </div>
                </Card>
              ))}
              {filteredRules.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No rules found
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="lg:col-span-8">
          {!hasEditor ? (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center space-y-3 p-8">
                <BookOpen className="h-12 w-12 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground">Select a rule to edit or create a new one</p>
                {canCreateRules && (
                  <Button onClick={startCreating} data-testid="button-create-rule-empty">
                    <Plus className="h-4 w-4 mr-1" />
                    Create Rule
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="builder" data-testid="tab-builder">
                    <Wrench className="h-4 w-4 mr-1" />
                    Builder
                  </TabsTrigger>
                  <TabsTrigger value="simulation" data-testid="tab-simulation">
                    <Play className="h-4 w-4 mr-1" />
                    Simulation
                  </TabsTrigger>
                  {!isCreating && (
                    <TabsTrigger value="history" data-testid="tab-history">
                      <History className="h-4 w-4 mr-1" />
                      History
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="builder">
                  <ScrollArea className="h-[500px] pr-3">
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="rule-name">Rule Name</Label>
                          <Input
                            id="rule-name"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Enter rule name"
                            data-testid="input-rule-name"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label>Type</Label>
                            <Select value={editType} onValueChange={(v) => setEditType(v as RuleType)}>
                              <SelectTrigger data-testid="select-rule-type">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="velocity">Velocity</SelectItem>
                                <SelectItem value="amount">Amount</SelectItem>
                                <SelectItem value="geographic">Geographic</SelectItem>
                                <SelectItem value="time">Time</SelectItem>
                                <SelectItem value="device">Device</SelectItem>
                                <SelectItem value="blacklist">Blacklist</SelectItem>
                                <SelectItem value="entity_relationship">Entity</SelectItem>
                                <SelectItem value="pattern">Pattern</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5">
                            <Label>Category</Label>
                            <Select value={editCategory} onValueChange={(v) => setEditCategory(v as RuleCategory)}>
                              <SelectTrigger data-testid="select-rule-category">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="fraud">Fraud</SelectItem>
                                <SelectItem value="aml">AML</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="rule-desc">Description</Label>
                        <Textarea
                          id="rule-desc"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Describe what this rule detects..."
                          rows={2}
                          data-testid="textarea-rule-description"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label>Severity</Label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {SEVERITY_CONFIG.map(s => (
                            <Button
                              key={s.value}
                              size="sm"
                              variant={editSeverity === s.value ? 'default' : 'outline'}
                              className={cn(
                                editSeverity === s.value && s.color,
                              )}
                              onClick={() => setEditSeverity(s.value)}
                              data-testid={`button-severity-${s.value}`}
                            >
                              {s.label}
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                          <Hash className="h-4 w-4" />
                          Conditions
                        </Label>
                        <ConditionBlockRenderer group={editConditionGroup} />
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-1.5">
                          <Zap className="h-4 w-4" />
                          Actions
                        </Label>
                        <div className="space-y-2">
                          {editActions.map((action, idx) => (
                            <div key={idx} className="flex items-center gap-2">
                              <Badge variant="outline" className="capitalize gap-1.5 no-default-hover-elevate no-default-active-elevate">
                                {actionIcon(action.type)}
                                {action.type.replace('_', ' ')}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive"
                                onClick={() => setEditActions(prev => prev.filter((_, i) => i !== idx))}
                                data-testid={`remove-action-${idx}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                          <Select
                            value=""
                            onValueChange={(v) => {
                              if (v) setEditActions(prev => [...prev, { type: v as RuleActionType }]);
                            }}
                          >
                            <SelectTrigger className="w-48" data-testid="select-add-action">
                              <SelectValue placeholder="Add action..." />
                            </SelectTrigger>
                            <SelectContent>
                              {ACTION_OPTIONS.map(a => (
                                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          onClick={handleSave}
                          disabled={isCreating ? !canCreateRules : !canEditRules}
                          data-testid="button-save-rule"
                        >
                          <Save className="h-4 w-4 mr-1" />
                          {isCreating ? 'Create Rule' : 'Save Changes'}
                        </Button>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="simulation">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Button
                        onClick={runSimulation}
                        disabled={simRunning || !canSimulateRules}
                        data-testid="button-run-simulation"
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {simRunning ? 'Running...' : 'Run Simulation'}
                      </Button>
                      <span className="text-xs text-muted-foreground">Tests against 500 sampled live transactions</span>
                    </div>

                    {simResults && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <Card className="p-3 text-center">
                            <p className="text-2xl font-bold" data-testid="text-sim-total">{simResults.total}</p>
                            <p className="text-xs text-muted-foreground">Total Tested</p>
                          </Card>
                          <Card className="p-3 text-center">
                            <p className="text-2xl font-bold" data-testid="text-sim-matches">{simResults.matches}</p>
                            <p className="text-xs text-muted-foreground">Matches</p>
                          </Card>
                          <Card className="p-3 text-center">
                            <p className="text-2xl font-bold" data-testid="text-sim-percentage">{simResults.percentage.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground">Hit Rate</p>
                          </Card>
                        </div>

                        <div className="space-y-1.5">
                          <Label>Hit Rate</Label>
                          <Progress value={simResults.percentage} className="h-2" />
                        </div>

                        {simResults.sampleMatches.length > 0 && (
                          <div className="space-y-2">
                            <Label>Sample Matched Transactions</Label>
                            <div className="border rounded-md overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="text-left p-2 font-medium">ID</th>
                                    <th className="text-left p-2 font-medium">Amount</th>
                                    <th className="text-left p-2 font-medium">Type</th>
                                    <th className="text-left p-2 font-medium">Customer</th>
                                    <th className="text-left p-2 font-medium">Risk</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {simResults.sampleMatches.map((tx) => (
                                    <tr key={tx.id} className="border-t">
                                      <td className="p-2 font-mono text-xs">{tx.id.slice(0, 12)}</td>
                                      <td className="p-2">${tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                      <td className="p-2 capitalize">{tx.type.replace('_', ' ')}</td>
                                      <td className="p-2 font-mono text-xs">{tx.customerId}</td>
                                      <td className="p-2">
                                        <Badge
                                          variant="outline"
                                          className={cn(
                                            'text-xs no-default-hover-elevate no-default-active-elevate',
                                            tx.riskScore >= 75 && 'bg-red-500/15 text-red-700 dark:text-red-400',
                                            tx.riskScore >= 50 && tx.riskScore < 75 && 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
                                            tx.riskScore >= 25 && tx.riskScore < 50 && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
                                            tx.riskScore < 25 && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
                                          )}
                                        >
                                          {tx.riskScore}
                                        </Badge>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {simResults.sampleMatches.length === 0 && (
                          <div className="text-center py-6 text-muted-foreground text-sm">
                            No transactions matched the current conditions
                          </div>
                        )}
                      </div>
                    )}

                    {!simResults && !simRunning && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Play className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Run a simulation to test your rule conditions</p>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {!isCreating && selectedRule && (
                  <TabsContent value="history">
                    <ScrollArea className="h-[500px] pr-3">
                      <div className="space-y-6">
                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5 text-base">
                            <History className="h-4 w-4" />
                            Version History
                          </Label>
                          <div className="space-y-2">
                            {[...selectedRule.versions].reverse().map(ver => (
                              <Card key={ver.version} className="p-3">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Badge variant="outline" className="no-default-hover-elevate no-default-active-elevate">v{ver.version}</Badge>
                                      {severityBadge(ver.severity)}
                                      {ver.version === selectedRule.currentVersion && (
                                        <Badge variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">Current</Badge>
                                      )}
                                    </div>
                                    <p className="text-sm">{ver.changeNote}</p>
                                    <p className="text-xs text-muted-foreground">
                                      by {ver.changedBy} &middot; {formatDistanceToNow(new Date(ver.changedAt), { addSuffix: true })}
                                    </p>
                                  </div>
                                  {ver.version !== selectedRule.currentVersion && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => restoreVersion(ver)}
                                          data-testid={`button-restore-v${ver.version}`}
                                        >
                                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                          Restore
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Restore this version to the builder</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="flex items-center gap-1.5 text-base">
                            <Clock className="h-4 w-4" />
                            Audit Log
                          </Label>
                          <div className="relative pl-4 space-y-0">
                            {selectedRule.auditLog.map((entry, idx) => (
                              <div key={entry.id} className="relative pb-4">
                                {idx < selectedRule.auditLog.length - 1 && (
                                  <div className="absolute left-[-12px] top-3 bottom-0 w-px bg-border" />
                                )}
                                <div className="absolute left-[-16px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="text-xs capitalize no-default-hover-elevate no-default-active-elevate">
                                      {entry.action.replace('_', ' ')}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {format(new Date(entry.timestamp), 'MMM d, yyyy HH:mm')}
                                    </span>
                                  </div>
                                  <p className="text-sm">{entry.details}</p>
                                  <p className="text-xs text-muted-foreground">by {entry.performedBy}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  </TabsContent>
                )}
              </Tabs>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Rules;
