import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Shield, Lock, Eye, EyeOff, Info, CheckCircle, AlertCircle } from 'lucide-react';
import snapnetLogo from '@/assets/snapnet-logo.png';
import snapfortLogo from '@assets/Snapfort_logo_1776891327655_1778813073391.png';
import { setCurrentUser, isDemoSwitcherEnabled } from '@/lib/currentUser';
import { notifyCurrentUserChanged } from '@/hooks/usePermissions';
import { queryClient } from '@/lib/queryClient';

const metrics = [
  { value: '99.2%', label: 'Real-time transaction coverage', tooltip: 'Percentage of inbound transactions scored in real time before authorization, measured over a rolling 30-day window.' },
  { value: '<300ms', label: 'Average risk-scoring latency', tooltip: 'Median end-to-end latency from transaction ingestion to risk score delivery, measured at the 95th percentile.' },
  { value: '45–70%', label: 'Reduction in false positives', tooltip: 'Observed reduction compared to rules-only baselines, measured across deployments with hybrid model + rules configurations.' },
  { value: '30–60%', label: 'Faster case resolution', tooltip: 'Improvement in mean time to resolution for fraud and AML cases, measured against pre-deployment baselines.' },
  { value: '24/7', label: 'Continuous monitoring', tooltip: 'Uninterrupted transaction monitoring with automated alerting, failover, and on-call escalation.' },
  { value: 'Multi-model', label: 'Rules & ML detection', tooltip: 'Combines deterministic rules engine with ensemble ML models (XGBoost, neural nets) for layered detection.' },
];

const complianceBadges = ['PCI DSS', 'ISO 27001', 'SOC 2', 'Audit-Ready Logs'];

interface DemoAccount {
  id: string;
  email: string;
  name: string;
  role: string;
}

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    if (!isDemoSwitcherEnabled) return;
    fetch('/api/users/demo-accounts', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: DemoAccount[]) => setDemoAccounts(Array.isArray(rows) ? rows : []))
      .catch(() => setDemoAccounts([]));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || 'Sign-in failed.');
        setIsLoading(false);
        return;
      }
      // Mirror identity into local state so the dev demo switcher reflects it.
      if (data?.userId && data?.name) setCurrentUser(data.userId, data.name);
      notifyCurrentUserChanged();
      queryClient.invalidateQueries();
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
      setIsLoading(false);
    }
  };

  const fillDemo = (acct: DemoAccount) => {
    setEmail(acct.email);
    setPassword('Demo123!');
  };

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-between p-12 relative overflow-hidden border-r border-white/10 bg-[#05070d]">
        {/* Layered ambient background */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(900px 600px at 20% 18%, rgba(56,189,248,0.18), transparent 60%),' +
              'radial-gradient(700px 500px at 78% 8%, rgba(139,92,246,0.16), transparent 60%),' +
              'radial-gradient(1100px 700px at 50% 110%, rgba(37,99,235,0.14), transparent 65%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(125,211,252,0.45) 50%, transparent 100%)',
          }}
        />
        <div className="absolute inset-0 bg-grid opacity-[0.07] pointer-events-none" />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.55) 0%, transparent 55%)',
          }}
        />
        {/* Inner ring for elevation */}
        <div
          aria-hidden
          className="absolute inset-3 rounded-2xl pointer-events-none ring-1 ring-inset ring-white/5"
        />

        <div className="relative z-10 space-y-10">
          <div className="flex items-center justify-between gap-4">
            <div className="relative">
              {/* Logo halo */}
              <div
                aria-hidden
                className="absolute -inset-10 rounded-full blur-3xl opacity-80 animate-pulse-glow-slow pointer-events-none"
                style={{
                  background:
                    'radial-gradient(circle at center, rgba(56,189,248,0.45) 0%, rgba(99,102,241,0.30) 35%, rgba(139,92,246,0.18) 60%, transparent 75%)',
                }}
              />
              <img
                src={snapfortLogo}
                alt="SnapFort — Fraud Detection & Anti Money Laundering"
                className="relative h-48 w-auto object-contain mix-blend-screen"
                data-testid="img-snapfort-hero"
              />
            </div>
            <img src={snapnetLogo} alt="Snapnet" className="h-9 w-auto opacity-70" />
          </div>
          <div className="space-y-3 max-w-lg">
            <h2 className="text-2xl font-semibold text-white tracking-tight leading-tight">
              Real-Time Fraud & AML Intelligence Platform
            </h2>
            <p className="text-sm text-white/70 leading-relaxed">
              SnapFort helps financial institutions detect fraud, monitor transactions, and investigate AML risks in real time using explainable risk intelligence.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 max-w-lg">
            {metrics.map((m) => (
              <div
                key={m.label}
                className="relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-1 backdrop-blur-md shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)] transition-colors hover:bg-white/[0.07] hover:border-white/20"
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-xl font-bold text-white tracking-tight">{m.value}</span>
                  <Tooltip delayDuration={200}>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-white/50 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[260px] text-xs">
                      {m.tooltip}
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-xs text-white/60">{m.label}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 space-y-3">
          <p className="text-[10px] text-white/50 uppercase tracking-widest font-medium">Compliance</p>
          <div className="flex flex-wrap gap-2">
            {complianceBadges.map((badge) => (
              <div
                key={badge}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/10 bg-white/[0.04] backdrop-blur-md text-xs text-white/70 font-medium"
              >
                <CheckCircle className="h-3 w-3 text-success" />
                {badge}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex items-center gap-3 justify-center">
            <img
              src={snapfortLogo}
              alt="SnapFort"
              className="h-20 w-auto object-contain"
              data-testid="img-snapfort-mobile"
            />
          </div>

          <div className="space-y-2 text-center lg:text-left">
            <div className="flex items-center gap-2 justify-center lg:justify-start">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold text-foreground tracking-tight">Sign in to SnapFort</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access the platform.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5" data-testid="form-login">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="analyst@institution.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
                data-testid="input-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="pr-10"
                  data-testid="input-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-xs" data-testid="text-login-error">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-sign-in">
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  Sign in to SnapFort
                </>
              )}
            </Button>
          </form>

          {isDemoSwitcherEnabled && demoAccounts.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">
                Demo accounts (password: <code className="font-mono">Demo123!</code>)
              </p>
              <div className="grid grid-cols-1 gap-1">
                {demoAccounts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => fillDemo(a)}
                    className="text-left px-2 py-1.5 rounded text-xs border border-border hover:bg-muted/60 flex items-center justify-between"
                    data-testid={`button-fill-demo-${a.id}`}
                  >
                    <span className="font-medium">{a.name}</span>
                    <span className="text-muted-foreground">{a.role}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-background px-3 text-muted-foreground">or</span>
              </div>
            </div>
            <Button variant="outline" className="w-full text-sm" disabled>
              Sign in with SSO (SAML / Azure AD / Okta)
            </Button>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-md border border-border bg-muted/30">
            <Lock className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              All access is logged and monitored for security and compliance purposes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
