import { useQuery } from '@tanstack/react-query';
import type {
  DashboardKpisPayload,
  DashboardTrendsPayload,
  ComplianceSnapshotPayload,
} from '@shared/schema';

const REFRESH_MS = 30_000;

export function useDashboardKpisQuery() {
  return useQuery<DashboardKpisPayload>({
    queryKey: ['/api/dashboard/kpis'],
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  });
}

export function useDashboardTrendsQuery(window: '24h' | '7d' | '30d' = '7d') {
  return useQuery<DashboardTrendsPayload>({
    queryKey: ['/api/dashboard/trends', window],
    queryFn: async () => {
      const res = await fetch(`/api/dashboard/trends?window=${encodeURIComponent(window)}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  });
}

export function useComplianceSnapshotQuery() {
  return useQuery<ComplianceSnapshotPayload>({
    queryKey: ['/api/dashboard/compliance-snapshot'],
    refetchInterval: REFRESH_MS,
    staleTime: REFRESH_MS / 2,
  });
}
