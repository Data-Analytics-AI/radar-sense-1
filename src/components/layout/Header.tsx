import { Bell, Search, User, LogOut, Check, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  setCurrentUser,
  getCurrentUserId,
  clearCurrentUser,
  isDemoSwitcherEnabled,
} from '@/lib/currentUser';
import { notifyCurrentUserChanged, usePermissions } from '@/hooks/usePermissions';
import { queryClient } from '@/lib/queryClient';
import type { UserRole } from '@/types';

interface DemoAccount {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  title: string;
  department: string;
}

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  risk_analyst: 'Risk Analyst',
  compliance_officer: 'Compliance Officer',
  aml_analyst: 'AML Analyst',
  ml_engineer: 'ML Engineer',
  auditor: 'Auditor',
  viewer: 'Viewer',
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'U';
}

export const Header = () => {
  const navigate = useNavigate();
  const { name: meName, email: meEmail, roles: meRoles } = usePermissions();
  const activeId = getCurrentUserId();

  // Demo switcher is dev-only. In production the only way to change the
  // signed-in user is to log out and log in as someone else.
  const { data: demoAccounts = [] } = useQuery<DemoAccount[]>({
    queryKey: ['/api/users/demo-accounts'],
    staleTime: 5 * 60_000,
    enabled: isDemoSwitcherEnabled,
  });

  const handleSwitchUser = (acct: DemoAccount) => {
    setCurrentUser(acct.id, acct.name);
    notifyCurrentUserChanged();
    queryClient.invalidateQueries();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    clearCurrentUser();
    notifyCurrentUserChanged();
    queryClient.clear();
    navigate('/login');
  };

  const displayName = meName || 'Signed-in user';
  const displayRole = meRoles[0] ? (ROLE_LABEL[meRoles[0] as UserRole] ?? meRoles[0]) : 'No role';

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions, alerts, cases..."
              className="pl-9 bg-muted/50 border-border/50 focus:bg-muted"
            />
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
            </span>
            <span className="text-xs font-medium text-success">Live</span>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                <Bell className="h-5 w-5" />
                <Badge className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-[10px] bg-destructive">
                  5
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Notifications</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <div className="max-h-[300px] overflow-y-auto">
                <DropdownMenuItem className="flex flex-col items-start gap-1 p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-destructive" />
                    <span className="font-medium text-sm">Critical Alert</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    High-risk transaction detected from new device - $9,500
                  </p>
                  <span className="text-[10px] text-muted-foreground">2 minutes ago</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-1 p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-warning" />
                    <span className="font-medium text-sm">Case Escalated</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    CASE-A7X3 requires senior analyst review
                  </p>
                  <span className="text-[10px] text-muted-foreground">15 minutes ago</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-1 p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-primary" />
                    <span className="font-medium text-sm">Model Updated</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    XGBoost model v2.3.1 deployed successfully
                  </p>
                  <span className="text-[10px] text-muted-foreground">1 hour ago</span>
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Signed-in user menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="flex items-center gap-2 px-2"
                data-testid="button-user-menu"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/20 text-primary text-sm">
                    {initialsOf(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left hidden md:block">
                  <p className="text-sm font-medium" data-testid="text-active-user-name">{displayName}</p>
                  <p className="text-xs text-muted-foreground" data-testid="text-active-user-role">{displayRole}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground hidden md:block" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium" data-testid="text-menu-user-name">{displayName}</span>
                  {meEmail && <span className="text-[11px] text-muted-foreground font-normal" data-testid="text-menu-user-email">{meEmail}</span>}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {isDemoSwitcherEnabled && demoAccounts.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Act as (dev only)
                  </DropdownMenuLabel>
                  {demoAccounts.map((acct) => {
                    const isActive = acct.id === activeId;
                    return (
                      <DropdownMenuItem
                        key={acct.id}
                        onClick={() => handleSwitchUser(acct)}
                        className="flex items-start gap-2 py-2"
                        data-testid={`menu-switch-user-${acct.id}`}
                      >
                        <Avatar className="h-7 w-7 mt-0.5">
                          <AvatarFallback className="bg-muted text-foreground text-[10px]">
                            {initialsOf(acct.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{acct.name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {ROLE_LABEL[acct.role] ?? acct.role}
                          </p>
                        </div>
                        {isActive && <Check className="h-4 w-4 text-success mt-1" />}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuItem disabled>
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={handleLogout} data-testid="menu-logout">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};
