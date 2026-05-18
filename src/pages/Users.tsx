import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Users as UsersIcon, Plus, Search, Shield, Mail, MoreHorizontal,
  Filter, ChevronDown, Clock, AlertTriangle, Lock, Key, Smartphone,
  Globe, Monitor, LogOut, RotateCcw, Eye, UserCheck, UserX, UserPlus,
  ShieldCheck, ShieldAlert, CheckCircle2, XCircle, ChevronRight,
  Bookmark, Download, Activity, FileText, Settings, ArrowUpDown,
  ScrollText, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  IAMUser, UserRole, UserStatus, PrivilegeLevel, SSOProvider,
  RoleDefinition, UserAuditEntry, PERMISSION_GROUPS,
  UserSession, AccessApproval,
} from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { usePermissions } from '@/hooks/usePermissions';
import { CANONICAL_ROLE_NAMES } from '@/lib/mock-data';
import { Trash2, Save } from 'lucide-react';

const genId = () => Math.random().toString(36).substring(2, 10);

const ROLE_CONFIG: Record<UserRole, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-destructive/20 text-destructive border-destructive/30' },
  risk_analyst: { label: 'Risk Analyst', className: 'bg-primary/20 text-primary border-primary/30' },
  compliance_officer: { label: 'Compliance', className: 'bg-warning/20 text-warning border-warning/30' },
  aml_analyst: { label: 'AML Analyst', className: 'bg-accent/20 text-accent border-accent/30' },
  ml_engineer: { label: 'ML Engineer', className: 'bg-blue-500/20 text-blue-500 border-blue-500/30' },
  auditor: { label: 'Auditor', className: 'bg-muted text-muted-foreground border-border' },
  viewer: { label: 'Viewer', className: 'bg-muted text-muted-foreground border-border' },
};

const STATUS_CONFIG: Record<UserStatus, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  active: { label: 'Active', className: 'border-success/30 text-success bg-success/10', icon: CheckCircle2 },
  invited: { label: 'Invited', className: 'border-blue-500/30 text-blue-500 bg-blue-500/10', icon: Mail },
  suspended: { label: 'Suspended', className: 'border-warning/30 text-warning bg-warning/10', icon: AlertTriangle },
  locked: { label: 'Locked', className: 'border-destructive/30 text-destructive bg-destructive/10', icon: Lock },
  deactivated: { label: 'Deactivated', className: 'border-muted-foreground/30 text-muted-foreground bg-muted', icon: XCircle },
};

const PRIVILEGE_CONFIG: Record<PrivilegeLevel, { label: string; className: string }> = {
  standard: { label: 'Standard', className: 'bg-muted text-muted-foreground border-border' },
  elevated: { label: 'Elevated', className: 'bg-warning/15 text-warning border-warning/30' },
  admin: { label: 'Admin', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const SSO_LABELS: Record<SSOProvider, string> = { azure_ad: 'Azure AD', okta: 'Okta', none: 'None' };

interface SavedView { id: string; label: string; filters: Partial<Filters>; }

interface Filters {
  search: string;
  role: UserRole | 'all';
  status: UserStatus | 'all';
  statusMulti?: UserStatus[];
  mfa: 'all' | 'enabled' | 'disabled';
  sso: 'all' | 'azure_ad' | 'okta' | 'none';
  privilege: PrivilegeLevel | 'all';
  privilegeMulti?: PrivilegeLevel[];
  hasFailedLogins?: boolean;
  hasPendingApprovals?: boolean;
}

const DEFAULT_FILTERS: Filters = { search: '', role: 'all', status: 'all', mfa: 'all', sso: 'all', privilege: 'all' };

const SAVED_VIEWS: SavedView[] = [
  { id: 'privileged', label: 'Privileged Accounts', filters: { privilegeMulti: ['admin', 'elevated'] } },
  { id: 'mfa-disabled', label: 'MFA Disabled', filters: { mfa: 'disabled' } },
  { id: 'locked-suspended', label: 'Locked / Suspended', filters: { statusMulti: ['locked', 'suspended'] } },
  { id: 'invited', label: 'Pending Invitations', filters: { status: 'invited' } },
];

const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

interface ServerRoleRow {
  id: string;
  name: UserRole;
  label: string;
  description: string;
  privilegeLevel: PrivilegeLevel;
  permissionKeys: string[];
}

interface AuditLogRow {
  id: string;
  actorUserId: string | null;
  actorName: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogResponse { rows: AuditLogRow[]; total: number; }

function privilegeFromRoles(roles: UserRole[]): PrivilegeLevel {
  if (roles.includes('admin')) return 'admin';
  if (roles.some(r => r === 'risk_analyst' || r === 'compliance_officer')) return 'elevated';
  return 'standard';
}

function normalizeUser(u: any): IAMUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    roles: (u.roles ?? []) as UserRole[],
    privilegeLevel: u.privilegeLevel ?? 'standard',
    status: u.status ?? 'active',
    department: u.department ?? '',
    team: u.team ?? '',
    title: u.title ?? '',
    mfaEnabled: !!u.mfaEnabled,
    ssoProvider: u.ssoProvider ?? 'none',
    authMethod: u.authMethod ?? 'local',
    lastLogin: u.lastLogin ?? '',
    lastLoginIp: u.lastLoginIp ?? '',
    lastLoginLocation: u.lastLoginLocation ?? '',
    lastLoginDevice: u.lastLoginDevice ?? '',
    lastActivity: u.lastActivity ?? '',
    lastActivityAction: u.lastActivityAction ?? '',
    failedLogins24h: u.failedLogins24h ?? 0,
    createdAt: u.createdAt ?? new Date().toISOString(),
    createdBy: u.createdBy ?? 'System',
    sessions: (u.sessions ?? []) as UserSession[],
    auditLog: (u.auditLog ?? []) as UserAuditEntry[],
    approvals: (u.approvals ?? []) as AccessApproval[],
  };
}

const Users = () => {
  const { toast } = useToast();
  const { can } = usePermissions();

  const usersQuery = useQuery<IAMUser[]>({
    queryKey: ['/api/users'],
    select: (rows) => (rows as unknown as any[]).map(normalizeUser),
  });
  const rolesQuery = useQuery<ServerRoleRow[]>({ queryKey: ['/api/roles'] });

  const users = usersQuery.data ?? [];
  const roleDefinitions: RoleDefinition[] = useMemo(() => {
    const list = rolesQuery.data ?? [];
    return list.map(r => ({
      id: r.id,
      name: r.name,
      label: r.label || r.name,
      description: r.description,
      privilegeLevel: r.privilegeLevel,
      permissions: r.permissionKeys ?? [],
      userCount: users.filter(u => u.roles.includes(r.name)).length,
    }));
  }, [rolesQuery.data, users]);

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'audit'>('users');
  const [sortBy, setSortBy] = useState<'lastLogin' | 'name' | 'privilege'>('lastLogin');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const selectedUser = useMemo(() => users.find(u => u.id === selectedUserId) || null, [users, selectedUserId]);

  // Mutations
  const patchUserMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<IAMUser> }) =>
      apiRequest('PATCH', `/api/users/${id}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/audit-log'] });
    },
    onError: (e: Error) => toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });

  const createUserMutation = useMutation({
    mutationFn: async (payload: Partial<IAMUser>) => apiRequest<IAMUser>('POST', '/api/users', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users'] });
      queryClient.invalidateQueries({ queryKey: ['/api/audit-log'] });
    },
    onError: (e: Error) => toast({ title: 'Create failed', description: e.message, variant: 'destructive' }),
  });

  const writeAudit = useCallback(async (
    action: string, targetType: string, targetId: string, metadata?: Record<string, unknown>,
  ) => {
    try {
      await apiRequest('POST', '/api/audit-log', { action, targetType, targetId, metadata: metadata ?? null });
      queryClient.invalidateQueries({ queryKey: ['/api/audit-log'] });
    } catch (e) {
      console.warn('audit append failed', e);
    }
  }, []);

  // Helpers that update embedded jsonb on the user (sessions / per-user auditLog / approvals)
  const patchUserEmbedded = useCallback((id: string, mutator: (u: IAMUser) => Partial<IAMUser>) => {
    const u = users.find(x => x.id === id);
    if (!u) return;
    const patch = mutator(u);
    patchUserMutation.mutate({ id, patch });
  }, [users, patchUserMutation]);

  const appendUserEmbeddedAudit = useCallback((userId: string, action: string, details: string) => {
    const u = users.find(x => x.id === userId);
    if (!u) return;
    const entry: UserAuditEntry = {
      id: genId(), action, timestamp: new Date().toISOString(), ipAddress: '10.0.0.23', details,
    };
    patchUserMutation.mutate({ id: userId, patch: { auditLog: [entry, ...u.auditLog] } });
  }, [users, patchUserMutation]);

  const filteredUsers = useMemo(() => {
    let result = [...users];
    if (filters.search) {
      const s = filters.search.toLowerCase();
      result = result.filter(u =>
        u.name.toLowerCase().includes(s) ||
        u.email.toLowerCase().includes(s) ||
        u.roles.some(r => (ROLE_CONFIG[r]?.label || r).toLowerCase().includes(s))
      );
    }
    if (filters.role !== 'all') result = result.filter(u => u.roles.includes(filters.role as UserRole));
    if (filters.statusMulti && filters.statusMulti.length > 0) {
      result = result.filter(u => filters.statusMulti!.includes(u.status));
    } else if (filters.status !== 'all') {
      result = result.filter(u => u.status === filters.status);
    }
    if (filters.mfa === 'enabled') result = result.filter(u => u.mfaEnabled);
    if (filters.mfa === 'disabled') result = result.filter(u => !u.mfaEnabled);
    if (filters.sso !== 'all') result = result.filter(u => u.ssoProvider === filters.sso);
    if (filters.privilegeMulti && filters.privilegeMulti.length > 0) {
      result = result.filter(u => filters.privilegeMulti!.includes(u.privilegeLevel));
    } else if (filters.privilege !== 'all') {
      result = result.filter(u => u.privilegeLevel === filters.privilege);
    }
    if (filters.hasFailedLogins) result = result.filter(u => u.failedLogins24h > 0);
    if (filters.hasPendingApprovals) result = result.filter(u => u.approvals.some(a => a.status === 'pending'));

    result.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'lastLogin') cmp = new Date(a.lastLogin || 0).getTime() - new Date(b.lastLogin || 0).getTime();
      else if (sortBy === 'name') cmp = a.name.localeCompare(b.name);
      else {
        const pl = { standard: 0, elevated: 1, admin: 2 };
        cmp = pl[a.privilegeLevel] - pl[b.privilegeLevel];
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return result;
  }, [users, filters, sortBy, sortDir]);

  const stats = useMemo(() => ({
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    admins: users.filter(u => u.privilegeLevel === 'admin' || u.privilegeLevel === 'elevated').length,
    mfaPct: users.length === 0 ? 0 : Math.round((users.filter(u => u.mfaEnabled).length / users.length) * 100),
    ssoCount: users.filter(u => u.ssoProvider !== 'none').length,
    lockedSuspended: users.filter(u => u.status === 'locked' || u.status === 'suspended').length,
    failedLogins: users.reduce((sum, u) => sum + u.failedLogins24h, 0),
    pendingApprovals: users.reduce((sum, u) => sum + u.approvals.filter(a => a.status === 'pending').length, 0),
  }), [users]);

  const handleStatusChange = useCallback((userId: string, newStatus: UserStatus) => {
    patchUserMutation.mutate({ id: userId, patch: { status: newStatus, isActive: newStatus === 'active' } as any });
    appendUserEmbeddedAudit(userId, `Status changed to ${newStatus}`, `User status updated to ${newStatus}`);
    writeAudit(`user.status.${newStatus}`, 'user', userId, { newStatus });
    toast({ title: 'Status Updated', description: `User status changed to ${newStatus}` });
  }, [patchUserMutation, appendUserEmbeddedAudit, writeAudit, toast]);

  const handleTerminateSession = useCallback((userId: string, sessionId: string) => {
    patchUserEmbedded(userId, u => ({ sessions: u.sessions.filter(s => s.id !== sessionId) }));
    appendUserEmbeddedAudit(userId, 'Session terminated', `Session ${sessionId} terminated by admin`);
    writeAudit('user.session.terminate', 'user', userId, { sessionId });
    toast({ title: 'Session Terminated' });
  }, [patchUserEmbedded, appendUserEmbeddedAudit, writeAudit, toast]);

  const handleMfaToggle = useCallback((userId: string, enabled: boolean) => {
    patchUserMutation.mutate({ id: userId, patch: { mfaEnabled: enabled } });
    appendUserEmbeddedAudit(userId, enabled ? 'MFA enabled' : 'MFA disabled', `MFA ${enabled ? 'enabled' : 'disabled'} by admin`);
    writeAudit(enabled ? 'user.mfa.enable' : 'user.mfa.disable', 'user', userId);
    toast({ title: `MFA ${enabled ? 'Enabled' : 'Disabled'}` });
  }, [patchUserMutation, appendUserEmbeddedAudit, writeAudit, toast]);

  const handleAddUser = useCallback(async (newUser: Partial<IAMUser>) => {
    const id = `USR-${Date.now().toString(36).toUpperCase()}`;
    const roles = (newUser.roles && newUser.roles.length > 0 ? newUser.roles : ['viewer']) as UserRole[];
    const payload = {
      id,
      email: newUser.email || '',
      name: newUser.name || '',
      role: roles[0],
      roles,
      privilegeLevel: privilegeFromRoles(roles),
      status: 'invited' as UserStatus,
      isActive: false,
      department: newUser.department || '',
      team: newUser.team || '',
      title: newUser.title || '',
      mfaEnabled: !!newUser.mfaEnabled,
      ssoProvider: (newUser.ssoProvider || 'none') as SSOProvider,
      authMethod: (newUser.authMethod || 'local') as 'local' | 'sso',
      failedLogins24h: 0,
      createdBy: 'John Doe',
      sessions: [],
      auditLog: [{
        id: genId(),
        action: 'User created',
        timestamp: new Date().toISOString(),
        ipAddress: '10.0.0.23',
        details: 'User account created and invitation sent',
      }],
      approvals: [],
    };
    await createUserMutation.mutateAsync(payload as any);
    setAddUserOpen(false);
    toast({ title: 'User Created', description: `Invitation sent to ${payload.email}` });
  }, [createUserMutation, toast]);

  const handleRoleToggle = useCallback((userId: string, role: UserRole, checked: boolean) => {
    const u = users.find(x => x.id === userId);
    if (!u) return;
    const nextRoles = checked
      ? Array.from(new Set([...u.roles, role]))
      : u.roles.filter(r => r !== role);
    if (nextRoles.length === 0) {
      toast({ title: 'At least one role is required', variant: 'destructive' });
      return;
    }
    patchUserMutation.mutate({
      id: userId,
      patch: { roles: nextRoles, role: nextRoles[0], privilegeLevel: privilegeFromRoles(nextRoles) } as any,
    });
    const def = roleDefinitions.find(r => r.name === role);
    if (def) {
      const url = `/api/users/${userId}/roles${checked ? '' : `/${def.id}`}`;
      apiRequest(checked ? 'POST' : 'DELETE', url, checked ? { roleId: def.id } : undefined).catch(() => {/* non-fatal */});
    }
    appendUserEmbeddedAudit(userId, checked ? `Role added: ${role}` : `Role removed: ${role}`, `Role ${role} ${checked ? 'added' : 'removed'} by admin`);
  }, [users, roleDefinitions, patchUserMutation, appendUserEmbeddedAudit, toast]);

  const applySavedView = useCallback((view: SavedView) => {
    setFilters({ ...DEFAULT_FILTERS, ...view.filters });
  }, []);

  const kpiCards = [
    { label: 'Total Users', value: stats.total, icon: UsersIcon, onClick: () => setFilters(DEFAULT_FILTERS), tip: 'Total number of registered users in the system' },
    { label: 'Active Users', value: stats.active, icon: UserCheck, className: 'border-l-4 border-l-success', onClick: () => setFilters({ ...DEFAULT_FILTERS, status: 'active' }), tip: 'Users with active status who can access the platform' },
    { label: 'Privileged Users', value: stats.admins, icon: ShieldAlert, className: 'border-l-4 border-l-warning', onClick: () => setFilters({ ...DEFAULT_FILTERS, privilegeMulti: ['admin', 'elevated'] }), tip: 'Admin and elevated privilege accounts' },
    { label: 'MFA Enabled', value: `${stats.mfaPct}%`, icon: Smartphone, className: 'border-l-4 border-l-primary', onClick: () => setFilters({ ...DEFAULT_FILTERS, mfa: 'enabled' }), tip: 'Percentage of users with multi-factor authentication enabled' },
    { label: 'SSO Enabled', value: stats.ssoCount, icon: Globe, className: 'border-l-4 border-l-accent', onClick: () => setFilters({ ...DEFAULT_FILTERS, sso: 'azure_ad' }), tip: 'Users authenticating via SSO providers' },
    { label: 'Locked / Suspended', value: stats.lockedSuspended, icon: Lock, className: 'border-l-4 border-l-destructive', onClick: () => setFilters({ ...DEFAULT_FILTERS, statusMulti: ['locked', 'suspended'] }), tip: 'Users currently locked out or suspended' },
    { label: 'Failed Logins (24h)', value: stats.failedLogins, icon: AlertTriangle, className: 'border-l-4 border-l-destructive', onClick: () => setFilters({ ...DEFAULT_FILTERS, hasFailedLogins: true }), tip: 'Total failed login attempts in the last 24 hours' },
    { label: 'Pending Approvals', value: stats.pendingApprovals, icon: Clock, className: 'border-l-4 border-l-blue-500', onClick: () => setFilters({ ...DEFAULT_FILTERS, hasPendingApprovals: true }), tip: 'Access requests awaiting approval' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-page-title">
            <UsersIcon className="h-6 w-6 text-primary" />
            User & Access Management
          </h1>
          <p className="text-muted-foreground">Manage user accounts, roles, permissions, and access policies</p>
        </div>
        <div className="flex items-center gap-2">
          {can('manage_roles') && (
            <Button variant="outline" onClick={() => setActiveTab('roles')} data-testid="button-manage-roles">
              <Shield className="h-4 w-4 mr-2" />
              Manage Roles
            </Button>
          )}
          {can('manage_users') && (
            <Button onClick={() => setAddUserOpen(true)} data-testid="button-add-user">
              <Plus className="h-4 w-4 mr-2" />
              Add User
            </Button>
          )}
        </div>
      </div>

      {usersQuery.isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground" data-testid="loading-users">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" /> Loading users…
        </div>
      ) : usersQuery.isError ? (
        <Card><CardContent className="py-6 text-sm text-destructive" data-testid="error-users">
          Failed to load users: {(usersQuery.error as Error).message}
        </CardContent></Card>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'users' | 'roles' | 'audit')} className="space-y-4">
          <TabsList>
            <TabsTrigger value="users" data-testid="tab-users-grid"><UsersIcon className="h-4 w-4 mr-1" /> Users</TabsTrigger>
            {can('manage_roles') && (
              <TabsTrigger value="roles" data-testid="tab-roles-editor"><Shield className="h-4 w-4 mr-1" /> Roles</TabsTrigger>
            )}
            <TabsTrigger value="audit" data-testid="tab-audit-log"><ScrollText className="h-4 w-4 mr-1" /> Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4 mt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
              {kpiCards.map((kpi) => (
                <Tooltip key={kpi.label}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn('stat-card cursor-pointer hover:shadow-md transition-shadow', kpi.className)}
                      onClick={kpi.onClick}
                      data-testid={`kpi-${kpi.label.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
                        <kpi.icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      </div>
                      <p className="text-2xl font-bold">{kpi.value}</p>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent><p>{kpi.tip}</p></TooltipContent>
                </Tooltip>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, role..."
                  className="pl-9"
                  value={filters.search}
                  onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
                  data-testid="input-search-users"
                />
              </div>
              <Select value={filters.role} onValueChange={v => setFilters(f => ({ ...f, role: v as any }))}>
                <SelectTrigger className="w-[140px]" data-testid="select-role-filter"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Roles</SelectItem>
                  {Object.entries(ROLE_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.status} onValueChange={v => setFilters(f => ({ ...f, status: v as any }))}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.mfa} onValueChange={v => setFilters(f => ({ ...f, mfa: v as any }))}>
                <SelectTrigger className="w-[130px]" data-testid="select-mfa-filter"><SelectValue placeholder="MFA" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All MFA</SelectItem>
                  <SelectItem value="enabled">MFA On</SelectItem>
                  <SelectItem value="disabled">MFA Off</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filters.sso} onValueChange={v => setFilters(f => ({ ...f, sso: v as any }))}>
                <SelectTrigger className="w-[130px]" data-testid="select-sso-filter"><SelectValue placeholder="SSO" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All SSO</SelectItem>
                  <SelectItem value="azure_ad">Azure AD</SelectItem>
                  <SelectItem value="okta">Okta</SelectItem>
                  <SelectItem value="none">None</SelectItem>
                </SelectContent>
              </Select>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-saved-views">
                    <Bookmark className="h-4 w-4 mr-1" /> Saved Views <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {SAVED_VIEWS.map(v => (
                    <DropdownMenuItem key={v.id} onClick={() => applySavedView(v)} data-testid={`view-${v.id}`}>{v.label}</DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setFilters(DEFAULT_FILTERS)}>Clear All Filters</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-sort">
                    <ArrowUpDown className="h-4 w-4 mr-1" /> Sort
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => { setSortBy('lastLogin'); setSortDir('desc'); }}>Last Login (Recent)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortBy('lastLogin'); setSortDir('asc'); }}>Last Login (Oldest)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortBy('name'); setSortDir('asc'); }}>Name (A-Z)</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { setSortBy('privilege'); setSortDir('desc'); }}>Privilege (High→Low)</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="stat-card">
              <div className="overflow-x-auto">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role(s)</th>
                      <th>Privilege</th>
                      <th>Status</th>
                      <th>MFA</th>
                      <th>SSO</th>
                      <th>Last Login</th>
                      <th>Last Activity</th>
                      <th>Failed (24h)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr><td colSpan={10} className="text-center py-12 text-muted-foreground">No users match the current filters</td></tr>
                    ) : filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className={cn(
                          'cursor-pointer hover:bg-muted/50 transition-colors',
                          selectedUserId === user.id && 'bg-primary/5 hover:bg-primary/10'
                        )}
                        onClick={() => setSelectedUserId(user.id)}
                        tabIndex={0}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedUserId(user.id); } }}
                        aria-selected={selectedUserId === user.id}
                        aria-expanded={selectedUserId === user.id}
                        role="button"
                        data-testid={`row-user-${user.id}`}
                      >
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback className="bg-primary/20 text-primary text-sm">{getInitials(user.name)}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-sm" data-testid={`text-username-${user.id}`}>{user.name}</p>
                              <p className="text-xs text-muted-foreground">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map(r => (
                              <Badge key={r} variant="outline" className={cn('text-[10px]', ROLE_CONFIG[r]?.className)}>{ROLE_CONFIG[r]?.label || r}</Badge>
                            ))}
                          </div>
                        </td>
                        <td><Badge variant="outline" className={cn('text-[10px]', PRIVILEGE_CONFIG[user.privilegeLevel].className)}>{PRIVILEGE_CONFIG[user.privilegeLevel].label}</Badge></td>
                        <td><Badge variant="outline" className={cn('text-[10px]', STATUS_CONFIG[user.status].className)}>{STATUS_CONFIG[user.status].label}</Badge></td>
                        <td>
                          <Badge variant="outline" className={cn('text-[10px]', user.mfaEnabled ? 'border-success/30 text-success bg-success/10' : 'border-destructive/30 text-destructive bg-destructive/10')}>
                            {user.mfaEnabled ? 'On' : 'Off'}
                          </Badge>
                        </td>
                        <td><span className="text-xs text-muted-foreground">{SSO_LABELS[user.ssoProvider]}</span></td>
                        <td>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-xs text-muted-foreground">
                                {user.lastLogin ? formatDistanceToNow(new Date(user.lastLogin), { addSuffix: true }) : 'Never'}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">{user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'No login recorded'}</p>
                              {user.lastLoginIp && <p className="text-xs text-muted-foreground">{user.lastLoginIp} • {user.lastLoginLocation}</p>}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td><span className="text-xs text-muted-foreground truncate max-w-[120px] block">{user.lastActivityAction || '—'}</span></td>
                        <td>
                          {user.failedLogins24h > 0 ? (
                            <Badge variant="outline" className="text-[10px] border-destructive/30 text-destructive bg-destructive/10">{user.failedLogins24h}</Badge>
                          ) : <span className="text-xs text-muted-foreground">0</span>}
                        </td>
                        <td>
                          <button
                            className="p-1 rounded hover:bg-muted/80 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setSelectedUserId(user.id); }}
                            tabIndex={-1}
                            aria-label={`Open details for ${user.name}`}
                            data-testid={`button-chevron-${user.id}`}
                          >
                            <ChevronRight className={cn('h-4 w-4 text-muted-foreground transition-transform', selectedUserId === user.id && 'rotate-90')} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 text-xs text-muted-foreground px-1">
                Showing {filteredUsers.length} of {users.length} users
              </div>
            </div>
          </TabsContent>

          {can('manage_roles') && (
            <TabsContent value="roles" className="mt-0">
              <RolesEditor roles={roleDefinitions} />
            </TabsContent>
          )}

          <TabsContent value="audit" className="mt-0">
            <AuditLogViewer users={users} />
          </TabsContent>
        </Tabs>
      )}

      {/* User Detail Drawer */}
      <Sheet open={!!selectedUser} onOpenChange={(open) => { if (!open) setSelectedUserId(null); }}>
        <SheetContent className="w-full sm:max-w-[540px] p-0 overflow-hidden" data-testid="drawer-user-detail">
          {selectedUser && (
            <div className="flex flex-col h-full">
              <SheetHeader className="p-6 pb-4 border-b">
                <div className="flex items-center gap-4">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="bg-primary/20 text-primary text-lg">{getInitials(selectedUser.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <SheetTitle className="text-lg" data-testid="text-drawer-username">{selectedUser.name}</SheetTitle>
                    <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className={cn('text-[10px]', STATUS_CONFIG[selectedUser.status].className)}>{STATUS_CONFIG[selectedUser.status].label}</Badge>
                      <Badge variant="outline" className={cn('text-[10px]', PRIVILEGE_CONFIG[selectedUser.privilegeLevel].className)}>{PRIVILEGE_CONFIG[selectedUser.privilegeLevel].label}</Badge>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <Tabs defaultValue="profile" className="flex-1 flex flex-col overflow-hidden">
                <TabsList className="mx-6 mt-3 grid grid-cols-5 w-auto">
                  <TabsTrigger value="profile" className="text-xs" data-testid="tab-profile">Profile</TabsTrigger>
                  <TabsTrigger value="roles" className="text-xs" data-testid="tab-roles">Roles</TabsTrigger>
                  <TabsTrigger value="security" className="text-xs" data-testid="tab-security">Security</TabsTrigger>
                  <TabsTrigger value="audit" className="text-xs" data-testid="tab-audit">Audit</TabsTrigger>
                  <TabsTrigger value="approvals" className="text-xs" data-testid="tab-approvals">SoD</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 px-6 pb-6">
                  <TabsContent value="profile" className="mt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {[
                        { label: 'Full Name', value: selectedUser.name },
                        { label: 'Email', value: selectedUser.email },
                        { label: 'Department', value: selectedUser.department },
                        { label: 'Team', value: selectedUser.team },
                        { label: 'Title', value: selectedUser.title },
                        { label: 'Created', value: selectedUser.createdAt ? formatDistanceToNow(new Date(selectedUser.createdAt), { addSuffix: true }) : '—' },
                        { label: 'Created By', value: selectedUser.createdBy },
                        { label: 'User ID', value: selectedUser.id },
                      ].map((f) => (
                        <div key={f.label}>
                          <p className="text-xs text-muted-foreground">{f.label}</p>
                          <p className="text-sm font-medium truncate">{f.value || '—'}</p>
                        </div>
                      ))}
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-2">Quick Actions</p>
                      {can('manage_users') ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedUser.status === 'active' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedUser.id, 'suspended')} data-testid="button-suspend-user">
                                <UserX className="h-3 w-3 mr-1" /> Suspend
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedUser.id, 'deactivated')} data-testid="button-deactivate-user">
                                <XCircle className="h-3 w-3 mr-1" /> Deactivate
                              </Button>
                            </>
                          )}
                          {(selectedUser.status === 'suspended' || selectedUser.status === 'locked') && (
                            <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedUser.id, 'active')} data-testid="button-activate-user">
                              <UserCheck className="h-3 w-3 mr-1" /> Activate
                            </Button>
                          )}
                          {selectedUser.status === 'deactivated' && (
                            <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedUser.id, 'active')} data-testid="button-reactivate-user">
                              <RotateCcw className="h-3 w-3 mr-1" /> Reactivate
                            </Button>
                          )}
                          {selectedUser.status === 'invited' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                appendUserEmbeddedAudit(selectedUser.id, 'Invite resent', `Invitation re-sent to ${selectedUser.email}`);
                                writeAudit('user.invite.resend', 'user', selectedUser.id);
                                toast({ title: 'Invitation resent', description: `Sent to ${selectedUser.email}.` });
                              }}
                              data-testid="button-resend-invite"
                            >
                              <Mail className="h-3 w-3 mr-1" /> Resend Invite
                            </Button>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">You do not have permission to change user status.</p>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="roles" className="mt-4 space-y-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Assigned Roles</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(ROLE_CONFIG) as UserRole[]).map(r => (
                          <label key={r} className="flex items-center gap-2 p-2 rounded border border-border bg-muted/20 text-xs cursor-pointer hover:bg-muted/40">
                            <Checkbox
                              checked={selectedUser.roles.includes(r)}
                              onCheckedChange={(c) => handleRoleToggle(selectedUser.id, r, !!c)}
                              disabled={!can('manage_roles')}
                              data-testid={`checkbox-user-role-${r}`}
                            />
                            <Badge variant="outline" className={cn('text-[10px]', ROLE_CONFIG[r].className)}>{ROLE_CONFIG[r].label}</Badge>
                          </label>
                        ))}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Role Permissions</p>
                      {selectedUser.roles.map(role => {
                        const rd = roleDefinitions.find(r => r.name === role);
                        if (!rd) return null;
                        return (
                          <div key={role} className="mb-3 p-3 rounded-lg bg-muted/30 border border-border">
                            <p className="text-sm font-medium mb-1">{rd.label}</p>
                            <p className="text-xs text-muted-foreground mb-2">{rd.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {rd.permissions.map(p => (
                                <Badge key={p} variant="outline" className="text-[10px] bg-muted">{p.replace(/_/g, ' ')}</Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Effective Permissions Summary</p>
                      {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => {
                        const allRolePerms = selectedUser.roles.flatMap(r => roleDefinitions.find(rd => rd.name === r)?.permissions || []);
                        const effective = perms.filter(p => allRolePerms.includes(p));
                        if (effective.length === 0) return null;
                        return (
                          <div key={group} className="mb-2">
                            <p className="text-xs font-medium text-muted-foreground">{group}</p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {perms.map(p => (
                                <Badge key={p} variant="outline" className={cn('text-[10px]', effective.includes(p) ? 'bg-success/10 text-success border-success/30' : 'bg-muted text-muted-foreground/40 line-through')}>
                                  {p.replace(/_/g, ' ')}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </TabsContent>

                  <TabsContent value="security" className="mt-4 space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
                      <div className="flex items-center gap-3">
                        <Smartphone className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">Multi-Factor Authentication</p>
                          <p className="text-xs text-muted-foreground">{selectedUser.mfaEnabled ? 'Enabled' : 'Not enabled'}</p>
                        </div>
                      </div>
                      <Switch
                        checked={selectedUser.mfaEnabled}
                        onCheckedChange={(checked) => handleMfaToggle(selectedUser.id, checked)}
                        disabled={!can('manage_users')}
                        data-testid="switch-mfa"
                      />
                    </div>
                    {can('manage_users') ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => { appendUserEmbeddedAudit(selectedUser.id, 'MFA reset', 'MFA reset by admin'); writeAudit('user.mfa.reset', 'user', selectedUser.id); toast({ title: 'MFA Reset' }); }} data-testid="button-reset-mfa">
                          <RotateCcw className="h-3 w-3 mr-1" /> Reset MFA
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { appendUserEmbeddedAudit(selectedUser.id, 'Password reset forced', 'Admin forced password reset'); writeAudit('user.password.reset', 'user', selectedUser.id); toast({ title: 'Password Reset Sent' }); }} data-testid="button-force-password-reset">
                          <Key className="h-3 w-3 mr-1" /> Force Password Reset
                        </Button>
                        {selectedUser.status === 'locked' ? (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedUser.id, 'active')} data-testid="button-unlock-account">
                            <Lock className="h-3 w-3 mr-1" /> Unlock Account
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => handleStatusChange(selectedUser.id, 'locked')} data-testid="button-lock-account">
                            <Lock className="h-3 w-3 mr-1" /> Lock Account
                          </Button>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic">You do not have permission to manage user security.</p>
                    )}
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Active Sessions ({selectedUser.sessions.length})</p>
                      {selectedUser.sessions.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">No active sessions</p>
                      ) : selectedUser.sessions.map(session => (
                        <div key={session.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border mb-2">
                          <div className="flex items-center gap-3">
                            <Monitor className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm">{session.device}</p>
                              <p className="text-xs text-muted-foreground">{session.ipAddress} • {session.location}</p>
                              <p className="text-xs text-muted-foreground">Login: {formatDistanceToNow(new Date(session.loginTime), { addSuffix: true })}</p>
                            </div>
                          </div>
                          {can('manage_users') && (
                            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleTerminateSession(selectedUser.id, session.id)} data-testid={`button-terminate-session-${session.id}`}>
                              <LogOut className="h-3 w-3 mr-1" /> End
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                    <Separator />
                    <div className="grid grid-cols-2 gap-3">
                      <div><p className="text-xs text-muted-foreground">Auth Method</p><p className="text-sm font-medium">{selectedUser.authMethod === 'sso' ? 'SSO' : 'Local'}</p></div>
                      <div><p className="text-xs text-muted-foreground">SSO Provider</p><p className="text-sm font-medium">{SSO_LABELS[selectedUser.ssoProvider]}</p></div>
                      <div><p className="text-xs text-muted-foreground">Failed Logins (24h)</p><p className="text-sm font-medium">{selectedUser.failedLogins24h}</p></div>
                    </div>
                  </TabsContent>

                  <TabsContent value="audit" className="mt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-medium">User Activity Log ({selectedUser.auditLog.length} entries)</p>
                      <Button size="sm" variant="outline" onClick={() => toast({ title: 'Audit log exported' })} data-testid="button-export-audit">
                        <Download className="h-3 w-3 mr-1" /> Export
                      </Button>
                    </div>
                    {selectedUser.auditLog.map(entry => (
                      <div key={entry.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30 border border-border">
                        <Activity className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{entry.action}</p>
                          <p className="text-xs text-muted-foreground">{entry.details}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}</span>
                            {entry.ipAddress && <span className="text-[10px] text-muted-foreground">• {entry.ipAddress}</span>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </TabsContent>

                  <TabsContent value="approvals" className="mt-4 space-y-4">
                    {selectedUser.privilegeLevel !== 'standard' && (
                      <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                        <div className="flex items-center gap-2 mb-1">
                          <ShieldAlert className="h-4 w-4 text-warning" />
                          <p className="text-sm font-medium text-warning">Privileged Account</p>
                        </div>
                        <p className="text-xs text-muted-foreground">This user has {selectedUser.privilegeLevel} privileges. Role changes require approval workflow.</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Approval History</p>
                      {selectedUser.approvals.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4 text-center">No approval records</p>
                      ) : selectedUser.approvals.map(approval => (
                        <div key={approval.id} className="p-3 rounded-lg bg-muted/30 border border-border mb-2">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-medium">Role: {ROLE_CONFIG[approval.requestedRole as UserRole]?.label || approval.requestedRole}</p>
                            <Badge variant="outline" className={cn('text-[10px]',
                              approval.status === 'approved' ? 'bg-success/10 text-success border-success/30' :
                              approval.status === 'rejected' ? 'bg-destructive/10 text-destructive border-destructive/30' :
                              'bg-warning/10 text-warning border-warning/30'
                            )}>{approval.status}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{approval.reason}</p>
                          <div className="text-[10px] text-muted-foreground space-y-0.5">
                            <p>Requested by: {approval.requestedBy} • {new Date(approval.requestedAt).toLocaleDateString()}</p>
                            {approval.approver && <p>Approved by: {approval.approver} • {approval.approvedAt ? new Date(approval.approvedAt).toLocaleDateString() : ''}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator />
                    <div>
                      <p className="text-xs text-muted-foreground mb-2 font-medium">Segregation of Duties Check</p>
                      {selectedUser.roles.length > 1 ? (
                        <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                          <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle className="h-4 w-4 text-warning" />
                            <p className="text-sm font-medium">Multi-Role Assignment Detected</p>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            This user holds {selectedUser.roles.length} roles ({selectedUser.roles.map(r => ROLE_CONFIG[r]?.label || r).join(', ')}).
                            Verify no conflicting duties exist per your SoD policy.
                          </p>
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg bg-success/10 border border-success/30">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-success" />
                            <p className="text-sm font-medium text-success">No SoD Conflicts</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">Single role assignment — no segregation of duties conflicts detected.</p>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AddUserDialog open={addUserOpen} onClose={() => setAddUserOpen(false)} onSubmit={handleAddUser} />
    </div>
  );
};

const AuditLogViewer = ({ users }: { users: IAMUser[] }) => {
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [since, setSince] = useState<string>('');

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (actorFilter !== 'all') p.set('actor', actorFilter);
    if (targetTypeFilter !== 'all') p.set('targetType', targetTypeFilter);
    if (since) {
      const d = new Date(since);
      if (!isNaN(d.getTime())) p.set('since', d.toISOString());
    }
    p.set('limit', '200');
    return p.toString();
  }, [actorFilter, targetTypeFilter, since]);

  const auditQuery = useQuery<AuditLogResponse>({
    queryKey: ['/api/audit-log', queryParams],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?${queryParams}`);
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
  });

  const rows = auditQuery.data?.rows ?? [];
  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter(r =>
      r.action.toLowerCase().includes(s) ||
      r.actorName.toLowerCase().includes(s) ||
      r.targetId.toLowerCase().includes(s) ||
      JSON.stringify(r.metadata ?? {}).toLowerCase().includes(s)
    );
  }, [rows, search]);

  const targetTypes = useMemo(() => {
    const set = new Set<string>();
    rows.forEach(r => { if (r.targetType) set.add(r.targetType); });
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search action, actor, target..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-audit-search"
          />
        </div>
        <Select value={actorFilter} onValueChange={setActorFilter}>
          <SelectTrigger className="w-[200px]" data-testid="select-audit-actor"><SelectValue placeholder="Actor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actors</SelectItem>
            {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={targetTypeFilter} onValueChange={setTargetTypeFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-audit-target-type"><SelectValue placeholder="Target Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Targets</SelectItem>
            {targetTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            {targetTypes.length === 0 && (
              <>
                <SelectItem value="user">user</SelectItem>
                <SelectItem value="role">role</SelectItem>
                <SelectItem value="customer">customer</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Since</Label>
          <Input
            type="date"
            value={since}
            onChange={e => setSince(e.target.value)}
            className="w-[150px]"
            data-testid="input-audit-since"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setActorFilter('all'); setTargetTypeFilter('all'); setSearch(''); setSince(''); }}
          data-testid="button-audit-reset"
        >
          Clear
        </Button>
      </div>

      <div className="stat-card">
        {auditQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground" data-testid="loading-audit">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading audit log…
          </div>
        ) : auditQuery.isError ? (
          <p className="text-sm text-destructive py-4 text-center" data-testid="error-audit">
            Failed to load audit log: {(auditQuery.error as Error).message}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>IP</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground" data-testid="empty-audit">
                    No audit entries match the current filters
                  </td></tr>
                ) : filtered.map(r => (
                  <tr key={r.id} data-testid={`row-audit-${r.id}`}>
                    <td className="text-xs text-muted-foreground whitespace-nowrap">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</span>
                        </TooltipTrigger>
                        <TooltipContent><p className="text-xs">{new Date(r.createdAt).toLocaleString()}</p></TooltipContent>
                      </Tooltip>
                    </td>
                    <td className="text-xs">{r.actorName}</td>
                    <td><Badge variant="outline" className="text-[10px]">{r.action}</Badge></td>
                    <td className="text-xs">{r.targetType ? `${r.targetType}:${r.targetId || '—'}` : '—'}</td>
                    <td className="text-xs text-muted-foreground">{r.ipAddress || '—'}</td>
                    <td className="text-xs text-muted-foreground max-w-[280px] truncate">
                      {r.metadata ? JSON.stringify(r.metadata) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {auditQuery.data && (
          <div className="mt-3 text-xs text-muted-foreground px-1">
            Showing {filtered.length} of {auditQuery.data.total} total entries
          </div>
        )}
      </div>
    </div>
  );
};

const AddUserDialog = ({ open, onClose, onSubmit }: { open: boolean; onClose: () => void; onSubmit: (user: Partial<IAMUser>) => void }) => {
  const [form, setForm] = useState({ name: '', email: '', roles: ['viewer'] as UserRole[], department: '', team: '', title: '', authMethod: 'local' as 'local' | 'sso', mfaEnabled: false, ssoProvider: 'none' as SSOProvider, inviteMessage: '' });

  const handleSubmit = () => {
    if (!form.name || !form.email) return;
    onSubmit({
      name: form.name, email: form.email, roles: form.roles,
      department: form.department, team: form.team, title: form.title,
      authMethod: form.authMethod, mfaEnabled: form.mfaEnabled, ssoProvider: form.ssoProvider,
      privilegeLevel: privilegeFromRoles(form.roles),
    });
    setForm({ name: '', email: '', roles: ['viewer'], department: '', team: '', title: '', authMethod: 'local', mfaEnabled: false, ssoProvider: 'none', inviteMessage: '' });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md" data-testid="dialog-add-user">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary" /> Add New User</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Full Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" data-testid="input-new-user-name" />
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@snapnet.com" data-testid="input-new-user-email" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Role(s)</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                <label key={key} className="flex items-center gap-1.5 text-xs cursor-pointer">
                  <Checkbox
                    checked={form.roles.includes(key as UserRole)}
                    onCheckedChange={(checked) => {
                      setForm(f => ({
                        ...f,
                        roles: checked ? [...f.roles, key as UserRole] : f.roles.filter(r => r !== key),
                      }));
                    }}
                    data-testid={`checkbox-role-${key}`}
                  />
                  {cfg.label}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Department</Label>
              <Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="Risk" data-testid="input-new-user-dept" />
            </div>
            <div>
              <Label className="text-xs">Team</Label>
              <Input value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} placeholder="Fraud Detection" data-testid="input-new-user-team" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Auth Method</Label>
            <Select value={form.authMethod} onValueChange={v => setForm(f => ({ ...f, authMethod: v as any }))}>
              <SelectTrigger data-testid="select-auth-method"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="sso">SSO</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={form.mfaEnabled} onCheckedChange={(c) => setForm(f => ({ ...f, mfaEnabled: !!c }))} data-testid="checkbox-require-mfa" />
              Require MFA
            </label>
          </div>
          <div>
            <Label className="text-xs">Invite Message (optional)</Label>
            <Textarea value={form.inviteMessage} onChange={e => setForm(f => ({ ...f, inviteMessage: e.target.value }))} placeholder="Welcome to SnapFort..." rows={2} data-testid="input-invite-message" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-add-user">Cancel</Button>
          <Button onClick={handleSubmit} disabled={!form.name || !form.email || form.roles.length === 0} data-testid="button-send-invite">
            <Mail className="h-4 w-4 mr-2" /> Send Invite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Admin-gated editor for role permission maps. Lists every role from
 * `/api/roles`, lets admins create custom roles, rename + edit
 * description / privilege / permissionKeys, and delete custom (non-canonical)
 * roles. All mutations go through the existing /api/roles endpoints, which
 * are themselves gated by `requirePermission('manage_roles')`.
 *
 * Canonical roles (admin, risk_analyst, compliance_officer, aml_analyst,
 * ml_engineer, auditor, viewer) are still editable for label / description
 * / permissions, but cannot be deleted (the boot-time reconciler would
 * recreate them anyway). Custom roles persist across restarts because the
 * reconciler only iterates the canonical definitions.
 */
const PRIVILEGE_OPTIONS: PrivilegeLevel[] = ['standard', 'elevated', 'admin'];

const RolesEditor = ({ roles }: { roles: RoleDefinition[] }) => {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const [draft, setDraft] = useState<RoleDefinition | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // Sync draft when selection or upstream role list changes.
  useEffect(() => {
    if (!selectedId && roles.length > 0) {
      setSelectedId(roles[0].id);
      return;
    }
    const r = roles.find(x => x.id === selectedId);
    setDraft(r ? { ...r, permissions: [...r.permissions] } : null);
  }, [selectedId, roles]);

  const isCanonical = useCallback(
    (name: string) => CANONICAL_ROLE_NAMES.includes(name as UserRole),
    [],
  );

  const dirty = useMemo(() => {
    if (!draft) return false;
    const orig = roles.find(r => r.id === draft.id);
    if (!orig) return false;
    if (orig.name !== draft.name) return true;
    if (orig.label !== draft.label) return true;
    if (orig.description !== draft.description) return true;
    if (orig.privilegeLevel !== draft.privilegeLevel) return true;
    if (orig.permissions.length !== draft.permissions.length) return true;
    const a = new Set(orig.permissions);
    return draft.permissions.some(p => !a.has(p));
  }, [draft, roles]);

  const nameError = useMemo(() => {
    if (!draft) return null;
    const orig = roles.find(r => r.id === draft.id);
    if (!orig || orig.name === draft.name) return null;
    if (isCanonical(orig.name)) return 'Canonical role names cannot be renamed.';
    if (!/^[a-z][a-z0-9_]*$/.test(draft.name)) return 'Must start with a letter, only a-z 0-9 _';
    if (roles.some(r => r.id !== draft.id && r.name === draft.name)) return 'Another role already uses this name.';
    return null;
  }, [draft, roles, isCanonical]);

  const saveMutation = useMutation({
    mutationFn: async (payload: RoleDefinition) => {
      const orig = roles.find(r => r.id === payload.id);
      const body: {
        name?: string;
        label: string;
        description: string;
        privilegeLevel: PrivilegeLevel;
        permissionKeys: string[];
      } = {
        label: payload.label,
        description: payload.description,
        privilegeLevel: payload.privilegeLevel,
        permissionKeys: payload.permissions,
      };
      if (orig && !isCanonical(orig.name) && orig.name !== payload.name) {
        body.name = payload.name;
      }
      return apiRequest('PATCH', `/api/roles/${payload.id}`, body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/audit-log'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/me/permissions'] });
      toast({ title: 'Role saved' });
    },
    onError: (e: Error) => toast({ title: 'Save failed', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest('DELETE', `/api/roles/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/audit-log'] });
      if (selectedId === id) setSelectedId(roles.find(r => r.id !== id)?.id ?? null);
      toast({ title: 'Role deleted' });
    },
    onError: (e: Error) => toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });

  const createMutation = useMutation({
    mutationFn: async (payload: { name: string; label: string; description: string; privilegeLevel: PrivilegeLevel; permissionKeys: string[] }) => {
      const id = `ROLE-CUSTOM-${Date.now().toString(36).toUpperCase()}`;
      return apiRequest<{ id: string; name: string }>('POST', '/api/roles', { id, ...payload });
    },
    onSuccess: (created: { id: string; name: string } | undefined) => {
      queryClient.invalidateQueries({ queryKey: ['/api/roles'] });
      queryClient.invalidateQueries({ queryKey: ['/api/audit-log'] });
      setCreateOpen(false);
      if (created?.id) setSelectedId(created.id);
      toast({ title: 'Role created' });
    },
    onError: (e: Error) => toast({ title: 'Create failed', description: e.message, variant: 'destructive' }),
  });

  const togglePerm = useCallback((perm: string, checked: boolean) => {
    setDraft(d => {
      if (!d) return d;
      const set = new Set(d.permissions);
      if (checked) set.add(perm); else set.delete(perm);
      return { ...d, permissions: Array.from(set) };
    });
  }, []);

  const toggleGroup = useCallback((perms: string[], checked: boolean) => {
    setDraft(d => {
      if (!d) return d;
      const set = new Set(d.permissions);
      perms.forEach(p => { if (checked) set.add(p); else set.delete(p); });
      return { ...d, permissions: Array.from(set) };
    });
  }, []);

  const handleDelete = useCallback((role: RoleDefinition) => {
    if (isCanonical(role.name)) {
      toast({ title: 'Cannot delete canonical role', description: `'${role.name}' is reconciled at boot and cannot be removed.`, variant: 'destructive' });
      return;
    }
    if (role.userCount > 0) {
      toast({ title: 'Role still in use', description: `${role.userCount} user(s) hold this role. Remove the assignments first.`, variant: 'destructive' });
      return;
    }
    if (!window.confirm(`Delete role "${role.label}"? This cannot be undone.`)) return;
    deleteMutation.mutate(role.id);
  }, [isCanonical, deleteMutation, toast]);

  return (
    <div className="space-y-4" data-testid="roles-editor">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Roles & Permissions</h2>
          <p className="text-xs text-muted-foreground">
            Edit role permission maps. Canonical roles are reset on every server restart; custom roles persist.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="button-create-role">
          <Plus className="h-4 w-4 mr-2" /> New Role
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Role list */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3 stat-card p-2">
          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {roles.length === 0 ? (
              <p className="text-xs text-muted-foreground p-3">No roles defined</p>
            ) : roles.map(r => {
              const canon = isCanonical(r.name);
              return (
                <div
                  key={r.id}
                  className={cn(
                    'p-2 rounded-md cursor-pointer text-sm hover:bg-muted/50 transition-colors',
                    selectedId === r.id && 'bg-muted',
                  )}
                  onClick={() => setSelectedId(r.id)}
                  data-testid={`role-list-item-${r.name}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium truncate">{r.label || r.name}</p>
                    {canon ? (
                      <Badge variant="outline" className="text-[9px] flex-shrink-0">canonical</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[9px] flex-shrink-0 border-blue-500/30 text-blue-500 bg-blue-500/10">custom</Badge>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {r.userCount} user{r.userCount === 1 ? '' : 's'} • {r.permissions.length} perm{r.permissions.length === 1 ? '' : 's'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="col-span-12 md:col-span-8 lg:col-span-9 stat-card">
          {!draft ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              Select a role to edit
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <Label className="text-xs">Role name (system)</Label>
                  <Input
                    value={draft.name}
                    onChange={e => {
                      const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                      setDraft(d => d ? { ...d, name: v } : d);
                    }}
                    disabled={isCanonical(roles.find(r => r.id === draft.id)?.name ?? draft.name)}
                    className="font-mono text-xs"
                    data-testid="input-role-name"
                  />
                  {nameError ? (
                    <p className="text-[10px] text-destructive mt-1">{nameError}</p>
                  ) : isCanonical(roles.find(r => r.id === draft.id)?.name ?? draft.name) ? (
                    <p className="text-[10px] text-muted-foreground mt-1">Canonical roles cannot be renamed</p>
                  ) : (
                    <p className="text-[10px] text-muted-foreground mt-1">Lowercase identifier (a-z, 0-9, _)</p>
                  )}
                </div>
                <div className="md:col-span-1">
                  <Label className="text-xs">Display label</Label>
                  <Input
                    value={draft.label}
                    onChange={e => setDraft(d => d ? { ...d, label: e.target.value } : d)}
                    data-testid="input-role-label"
                  />
                </div>
                <div className="md:col-span-1">
                  <Label className="text-xs">Privilege level</Label>
                  <Select
                    value={draft.privilegeLevel}
                    onValueChange={v => setDraft(d => d ? { ...d, privilegeLevel: v as PrivilegeLevel } : d)}
                  >
                    <SelectTrigger data-testid="select-role-privilege"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIVILEGE_OPTIONS.map(p => (
                        <SelectItem key={p} value={p}>{PRIVILEGE_CONFIG[p].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-3">
                  <Label className="text-xs">Description</Label>
                  <Textarea
                    value={draft.description}
                    onChange={e => setDraft(d => d ? { ...d, description: e.target.value } : d)}
                    rows={2}
                    data-testid="textarea-role-description"
                  />
                </div>
              </div>

              <Separator />

              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium">Permissions ({draft.permissions.length})</p>
                  <p className="text-[10px] text-muted-foreground">{draft.userCount} assigned user{draft.userCount === 1 ? '' : 's'}</p>
                </div>
                <div className="space-y-4">
                  {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => {
                    const active = perms.filter(p => draft.permissions.includes(p));
                    const allOn = active.length === perms.length;
                    const someOn = active.length > 0 && active.length < perms.length;
                    return (
                      <div key={group} className="rounded-lg border border-border p-3 bg-muted/20">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{group}</p>
                            <Badge variant="outline" className="text-[10px]">{active.length}/{perms.length}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-[10px] text-muted-foreground">{allOn ? 'All on' : someOn ? 'Partial' : 'All off'}</Label>
                            <Checkbox
                              checked={allOn ? true : someOn ? 'indeterminate' : false}
                              onCheckedChange={(c) => toggleGroup(perms, !!c)}
                              data-testid={`checkbox-perm-group-${group.toLowerCase()}`}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {perms.map(p => (
                            <label
                              key={p}
                              className="flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-muted/40"
                            >
                              <Checkbox
                                checked={draft.permissions.includes(p)}
                                onCheckedChange={(c) => togglePerm(p, !!c)}
                                data-testid={`checkbox-perm-${p}`}
                              />
                              <span className="font-mono text-[11px]">{p}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  {isCanonical(draft.name) ? (
                    <p className="text-[11px] text-muted-foreground italic">
                      Canonical role — boot reconciler will reset edits to {draft.name} on next server restart.
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground italic">Custom role — edits persist across restarts.</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => handleDelete(draft)}
                    disabled={isCanonical(draft.name) || deleteMutation.isPending}
                    className="text-destructive hover:text-destructive"
                    data-testid="button-delete-role"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const orig = roles.find(r => r.id === draft.id);
                      if (orig) setDraft({ ...orig, permissions: [...orig.permissions] });
                    }}
                    disabled={!dirty || saveMutation.isPending}
                    data-testid="button-revert-role"
                  >
                    Revert
                  </Button>
                  <Button
                    onClick={() => saveMutation.mutate(draft)}
                    disabled={!dirty || saveMutation.isPending || !!nameError || !draft.name.trim()}
                    data-testid="button-save-role"
                  >
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <CreateRoleDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={(payload) => createMutation.mutate(payload)}
        existingNames={new Set(roles.map(r => r.name))}
        submitting={createMutation.isPending}
      />
    </div>
  );
};

const CreateRoleDialog = ({
  open, onClose, onSubmit, existingNames, submitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; label: string; description: string; privilegeLevel: PrivilegeLevel; permissionKeys: string[] }) => void;
  existingNames: Set<string>;
  submitting: boolean;
}) => {
  const [form, setForm] = useState({ name: '', label: '', description: '', privilegeLevel: 'standard' as PrivilegeLevel, permissionKeys: [] as string[] });

  useEffect(() => {
    if (!open) setForm({ name: '', label: '', description: '', privilegeLevel: 'standard', permissionKeys: [] });
  }, [open]);

  const nameOk = /^[a-z][a-z0-9_]*$/.test(form.name);
  const nameTaken = existingNames.has(form.name);
  const canSubmit = nameOk && !nameTaken && form.label.trim().length > 0 && !submitting;

  const togglePerm = (p: string, checked: boolean) => {
    setForm(f => {
      const set = new Set(f.permissionKeys);
      if (checked) set.add(p); else set.delete(p);
      return { ...f, permissionKeys: Array.from(set) };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" data-testid="dialog-create-role">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Create Custom Role</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-3">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">System name (lowercase, no spaces) *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                  placeholder="e.g. fraud_lead"
                  className="font-mono text-xs"
                  data-testid="input-new-role-name"
                />
                {form.name && !nameOk && <p className="text-[10px] text-destructive mt-1">Must start with a letter, only a-z 0-9 _</p>}
                {nameTaken && <p className="text-[10px] text-destructive mt-1">A role with this name already exists</p>}
              </div>
              <div>
                <Label className="text-xs">Display label *</Label>
                <Input
                  value={form.label}
                  onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Fraud Lead"
                  data-testid="input-new-role-label"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="What does this role do?"
                  data-testid="textarea-new-role-description"
                />
              </div>
              <div>
                <Label className="text-xs">Privilege level</Label>
                <Select value={form.privilegeLevel} onValueChange={v => setForm(f => ({ ...f, privilegeLevel: v as PrivilegeLevel }))}>
                  <SelectTrigger data-testid="select-new-role-privilege"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIVILEGE_OPTIONS.map(p => <SelectItem key={p} value={p}>{PRIVILEGE_CONFIG[p].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-sm font-medium mb-2">Permissions ({form.permissionKeys.length})</p>
              <div className="space-y-3">
                {Object.entries(PERMISSION_GROUPS).map(([group, perms]) => (
                  <div key={group} className="rounded-lg border border-border p-3 bg-muted/20">
                    <p className="text-xs font-medium text-muted-foreground mb-2">{group}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {perms.map(p => (
                        <label key={p} className="flex items-center gap-2 px-2 py-1 rounded text-xs cursor-pointer hover:bg-muted/40">
                          <Checkbox
                            checked={form.permissionKeys.includes(p)}
                            onCheckedChange={(c) => togglePerm(p, !!c)}
                            data-testid={`checkbox-new-perm-${p}`}
                          />
                          <span className="font-mono text-[11px]">{p}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-create-role">Cancel</Button>
          <Button
            onClick={() => onSubmit({
              name: form.name,
              label: form.label.trim(),
              description: form.description.trim(),
              privilegeLevel: form.privilegeLevel,
              permissionKeys: form.permissionKeys,
            })}
            disabled={!canSubmit}
            data-testid="button-submit-create-role"
          >
            {submitting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Create Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default Users;
