import { QueryClient } from "@tanstack/react-query";
import { actorHeaders } from "./currentUser";

async function defaultFetcher({ queryKey }: { queryKey: readonly unknown[] }) {
  const url = queryKey
    .filter((k) => k !== undefined && k !== null && k !== "")
    .map((k) => (typeof k === "string" ? k : JSON.stringify(k)))
    .join("/");
  const res = await fetch(url, { credentials: "include", headers: actorHeaders() });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.error) detail = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultFetcher as never,
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
});

export async function apiRequest<T = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<T> {
  const hasBody = body !== undefined && method !== "GET";
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      ...actorHeaders(),
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.error) detail = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(`${res.status}: ${detail}`);
  }
  if (res.status === 204) return null as T;
  return res.json();
}
