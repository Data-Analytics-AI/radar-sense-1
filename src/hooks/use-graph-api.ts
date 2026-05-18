import { useQuery } from "@tanstack/react-query";
import type { GraphNetworkPayload } from "@shared/schema";

export interface GraphFilters {
  window?: "24h" | "7d" | "30d" | "all";
  riskLevel?: string;
  entityType?: string;
  edgeType?: string;
  limit?: number;
}

export function useGraphNetworkQuery(filters: GraphFilters = {}) {
  return useQuery<GraphNetworkPayload>({
    queryKey: ["/api/graph/network", filters],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (filters.window) sp.set("window", filters.window);
      if (filters.riskLevel) sp.set("riskLevel", filters.riskLevel);
      if (filters.entityType) sp.set("entityType", filters.entityType);
      if (filters.edgeType) sp.set("edgeType", filters.edgeType);
      if (typeof filters.limit === "number") sp.set("limit", String(filters.limit));
      const qs = sp.toString();
      const res = await fetch(`/api/graph/network${qs ? `?${qs}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    staleTime: 30_000,
  });
}
