import { Navigate, useLocation } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';

/**
 * Guards every authenticated route. Redirects unauthenticated visitors to
 * /login and preserves the requested path so they can be sent back after a
 * successful sign-in.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, error } = usePermissions();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span className="h-4 w-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          Loading session…
        </div>
      </div>
    );
  }

  if (!isAuthenticated || error) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
