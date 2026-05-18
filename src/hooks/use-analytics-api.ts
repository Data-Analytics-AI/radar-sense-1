import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import type {
  AnalyticsFiltersInput, AnalyticsTab, AnalyticsTabPayloadMap,
} from "@shared/schema";

function buildQs(f: AnalyticsFiltersInput): string {
  const sp = new URLSearchParams();
  sp.set("timeRange", f.timeRange);
  sp.set("channel", f.channel);
  sp.set("country", f.country);
  return `?${sp.toString()}`;
}

export function useAnalyticsTabQuery<T extends AnalyticsTab>(
  tab: T,
  filters: AnalyticsFiltersInput,
  options?: Partial<UseQueryOptions<AnalyticsTabPayloadMap[T]>>,
) {
  return useQuery<AnalyticsTabPayloadMap[T]>({
    queryKey: ["/api/analytics", tab, filters],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/${tab}${buildQs(filters)}`, { credentials: "include" });
      if (!res.ok) {
        let detail = res.statusText;
        try { const j = await res.json(); if (j?.error) detail = j.error; } catch { /* ignore */ }
        throw new Error(`${res.status}: ${detail}`);
      }
      return res.json() as Promise<AnalyticsTabPayloadMap[T]>;
    },
    staleTime: 30_000,
    ...options,
  });
}
