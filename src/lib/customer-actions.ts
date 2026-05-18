import { useEffect, useState } from 'react';

const STORAGE_KEY = 'snapfort.customers.actionLog.v1';
const EVENT = 'snapfort:customer-actions-changed';

export type CustomerActionKind =
  | 'send_edd'
  | 'open_case'
  | 'file_str'
  | 'add_watchlist'
  | 'remove_watchlist'
  | 'run_screening'
  | 'block'
  | 'unblock'
  | 'message'
  | 'tag_high_risk'
  | 'untag_high_risk'
  | 'assign_investigator'
  | 'recalc_risk'
  | 'export_report'
  | 'rescreen_bulk';

export interface CustomerActivityEntry {
  id: string;
  ts: number;
  actor: string;
  action: CustomerActionKind;
  label: string;
  note?: string;
}

export type ScreeningStatus = 'cleared' | 'pep' | 'sanction' | 'watchlist' | 'adverse_media';

export interface CustomerPersistedState {
  watchlisted?: boolean;
  eddRequested?: boolean;
  blocked?: boolean;
  taggedHighRisk?: boolean;
  strDrafted?: boolean;
  caseOpened?: boolean;
  investigatorAssigned?: string | null;
  lastScreeningStatus?: ScreeningStatus;
  lastScreeningAt?: number;
  riskAdjustment?: number;
}

export interface CustomerRecord {
  state: CustomerPersistedState;
  entries: CustomerActivityEntry[];
}

type Store = Record<string, CustomerRecord>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(s: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* ignore */
  }
}

export function getCustomerRecord(id: string): CustomerRecord {
  const s = readStore();
  return s[id] ?? { state: {}, entries: [] };
}

export function getAllCustomerRecords(): Store {
  return readStore();
}

export function recordCustomerAction(
  id: string,
  entry: { actor: string; action: CustomerActionKind; label: string; note?: string; ts?: number },
  statePatch: Partial<CustomerPersistedState> = {},
): CustomerActivityEntry {
  const store = readStore();
  const cur = store[id] ?? { state: {}, entries: [] };
  const nextEntry: CustomerActivityEntry = {
    id: `act-${id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: entry.ts ?? Date.now(),
    actor: entry.actor,
    action: entry.action,
    label: entry.label,
    note: entry.note,
  };
  store[id] = {
    state: { ...cur.state, ...statePatch },
    entries: [nextEntry, ...cur.entries].slice(0, 200),
  };
  writeStore(store);
  return nextEntry;
}

export function patchCustomerState(id: string, patch: Partial<CustomerPersistedState>): void {
  const store = readStore();
  const cur = store[id] ?? { state: {}, entries: [] };
  store[id] = { state: { ...cur.state, ...patch }, entries: cur.entries };
  writeStore(store);
}

export function subscribeCustomerActions(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function useCustomerRecord(id: string): CustomerRecord {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeCustomerActions(() => setTick(t => t + 1)), []);
  void tick;
  return getCustomerRecord(id);
}

export function useAllCustomerRecords(): Store {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeCustomerActions(() => setTick(t => t + 1)), []);
  void tick;
  return getAllCustomerRecords();
}

export const ACTION_LABELS: Record<CustomerActionKind, string> = {
  send_edd: 'Sent for EDD',
  open_case: 'Case opened',
  file_str: 'STR drafted',
  add_watchlist: 'Added to watchlist',
  remove_watchlist: 'Removed from watchlist',
  run_screening: 'Screening run',
  block: 'Account blocked',
  unblock: 'Account unblocked',
  message: 'Message sent',
  tag_high_risk: 'Tagged high-risk',
  untag_high_risk: 'Untagged high-risk',
  assign_investigator: 'Investigator assigned',
  recalc_risk: 'Risk recalculated',
  export_report: 'Report exported',
  rescreen_bulk: 'Re-screened (bulk)',
};

export const CURRENT_ACTOR = 'Current Analyst';
