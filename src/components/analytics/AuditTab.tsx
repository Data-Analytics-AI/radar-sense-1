import { useState, useMemo } from 'react';
import type { AnalyticsData } from '@/lib/analytics-data';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { ChevronRight, Lock, Search, Users, Activity, List } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AuditTabProps {
  data: AnalyticsData['audit'];
}

const actionTypes = ['all', 'login', 'logout', 'role_change', 'rule_edit', 'export', 'case_status_change', 'password_reset', 'mfa_toggle'] as const;

const actionColorMap: Record<string, string> = {
  login: 'bg-muted text-muted-foreground', logout: 'bg-muted text-muted-foreground',
  role_change: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  rule_edit: 'bg-primary/10 text-primary',
  export: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  case_status_change: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  password_reset: 'bg-destructive/10 text-destructive',
  mfa_toggle: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
};

type DrawerState = { open: boolean; title: string; subtitle?: string; event?: AnalyticsData['audit']['auditEvents'][0] };

export function AuditTab({ data }: AuditTabProps) {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('');
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: '' });

  const filtered = useMemo(() => {
    return data.auditEvents.filter(e => {
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      if (userFilter && !e.user.toLowerCase().includes(userFilter.toLowerCase())) return false;
      if (search) {
        const q = search.toLowerCase();
        return e.user.toLowerCase().includes(q) || e.action.toLowerCase().includes(q) || e.target.toLowerCase().includes(q) || e.details.toLowerCase().includes(q) || e.correlationId.toLowerCase().includes(q);
      }
      return true;
    });
  }, [data.auditEvents, search, actionFilter, userFilter]);

  const stats = useMemo(() => {
    const events = data.auditEvents;
    const uniqueUsers = new Set(events.map(e => e.user)).size;
    const actionCounts: Record<string, number> = {};
    events.forEach(e => { actionCounts[e.action] = (actionCounts[e.action] || 0) + 1; });
    const mostCommon = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];
    return { total: events.length, uniqueUsers, mostCommon: mostCommon ? `${mostCommon[0]} (${mostCommon[1]})` : 'N/A' };
  }, [data.auditEvents]);

  const openEventDrawer = (e: AnalyticsData['audit']['auditEvents'][0]) => {
    setDrawer({ open: true, title: `Event: ${e.action}`, subtitle: e.id, event: e });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-lg border border-border/60 bg-card" data-testid="stat-total-events">
          <div className="flex items-center gap-2 mb-1"><List className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Total Events</span></div>
          <p className="text-lg font-bold">{stats.total.toLocaleString()}</p>
        </div>
        <div className="p-3 rounded-lg border border-border/60 bg-card" data-testid="stat-unique-users">
          <div className="flex items-center gap-2 mb-1"><Users className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Unique Users</span></div>
          <p className="text-lg font-bold">{stats.uniqueUsers}</p>
        </div>
        <div className="p-3 rounded-lg border border-border/60 bg-card" data-testid="stat-most-common">
          <div className="flex items-center gap-2 mb-1"><Activity className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs text-muted-foreground">Most Common</span></div>
          <p className="text-sm font-bold truncate">{stats.mostCommon}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search events..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 text-xs" data-testid="input-search-audit" />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[180px] text-xs" data-testid="select-action-type">
            <SelectValue placeholder="Action type" />
          </SelectTrigger>
          <SelectContent>
            {actionTypes.map(t => (
              <SelectItem key={t} value={t} data-testid={`option-action-${t}`}>{t === 'all' ? 'All Actions' : t.replace(/_/g, ' ')}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Filter by user..." value={userFilter} onChange={e => setUserFilter(e.target.value)} className="w-[160px] text-xs" data-testid="input-filter-user" />
      </div>

      <div className="rounded-lg border border-border/60 bg-card overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Timestamp</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">User</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Action</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Target</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Immutable</th>
              <th className="text-left py-2 px-3 font-medium text-muted-foreground">Correlation ID</th>
              <th className="w-6"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} onClick={() => openEventDrawer(e)} data-testid={`row-audit-${e.id}`}
                className="border-b border-border/30 cursor-pointer hover-elevate active-elevate-2">
                <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                <td className="py-2 px-3">{e.user}</td>
                <td className="py-2 px-3">
                  <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium", actionColorMap[e.action] || 'bg-muted text-muted-foreground')}>
                    {e.action.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="py-2 px-3 max-w-[160px] truncate">{e.target}</td>
                <td className="py-2 px-3">{e.immutable && <Lock className="h-3 w-3 text-muted-foreground" />}</td>
                <td className="py-2 px-3 font-mono text-muted-foreground max-w-[100px] truncate">{e.correlationId}</td>
                <td className="py-2 px-1"><ChevronRight className="h-3 w-3 text-muted-foreground" /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No events match your filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <AnalyticsDrawer open={drawer.open} onOpenChange={o => setDrawer(p => ({ ...p, open: o }))} title={drawer.title} subtitle={drawer.subtitle}
        sections={drawer.event ? [
          { label: 'Timestamp', value: new Date(drawer.event.timestamp).toLocaleString() },
          { label: 'User', value: drawer.event.user },
          { label: 'Action', value: drawer.event.action.replace(/_/g, ' ') },
          { label: 'Target', value: drawer.event.target },
          { label: 'Immutable', value: drawer.event.immutable ? 'Yes' : 'No', highlight: drawer.event.immutable },
          { label: 'Correlation ID', value: drawer.event.correlationId },
        ] : undefined}>
        {drawer.event && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Details</p>
              <p className="text-xs text-foreground">{drawer.event.details}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Event JSON</p>
              <pre className="p-3 rounded-lg bg-muted/30 border border-border/50 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap">
                <code>{JSON.stringify(drawer.event, null, 2)}</code>
              </pre>
            </div>
          </div>
        )}
      </AnalyticsDrawer>
    </div>
  );
}
