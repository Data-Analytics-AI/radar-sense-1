import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { actorHeaders, getCurrentUserId } from '@/lib/currentUser';

export interface CurrentUserPermissions {
  userId: string;
  email?: string;
  name: string;
  roles: string[];
  permissions: string[];
}

const STORAGE_EVENT = 'snapfort:current-user-changed';

export function notifyCurrentUserChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STORAGE_EVENT));
  }
}

function useActiveUserId(): string {
  const [id, setId] = useState<string>(() => getCurrentUserId());
  useEffect(() => {
    const handler = () => setId(getCurrentUserId());
    window.addEventListener(STORAGE_EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(STORAGE_EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  return id;
}

/**
 * Returns the verified signed-in user's identity + effective permissions.
 * Source of truth is `/api/auth/me`, which reads the session cookie. The
 * dev demo-switcher additionally keys the cache by the local actor id so
 * switching users invalidates this query without a real re-login.
 */
export function usePermissions() {
  const devActorId = useActiveUserId(); // only present in dev (cache key)
  const query = useQuery<CurrentUserPermissions>({
    queryKey: ['/api/auth/me', { actor: devActorId }],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: actorHeaders(),
      });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    retry: false,
    staleTime: 60_000,
  });
  const perms = new Set(query.data?.permissions ?? []);
  const roles = query.data?.roles ?? [];
  const isAdmin = roles.includes('admin');
  return {
    userId: query.data?.userId ?? '',
    email: query.data?.email ?? '',
    name: query.data?.name ?? '',
    roles,
    permissions: query.data?.permissions ?? [],
    isLoading: query.isLoading,
    isAuthenticated: !!query.data?.userId,
    error: query.error,
    can: (key: string): boolean => isAdmin || perms.has(key),
    hasRole: (role: string): boolean => roles.includes(role),
  };
}
