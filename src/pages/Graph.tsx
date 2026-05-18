import { useState, useRef, useCallback, useMemo } from 'react';
import {
  Network, Search, ZoomIn, ZoomOut, Maximize2, X, User, CreditCard,
  Smartphone, Building2, Bot, Eye, Download, Briefcase, Tag, ArrowRight,
  AlertTriangle, Globe, Activity, Route, Lock, Unlock, FileText, Plus,
  Shield, Clock, TrendingUp, Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useGraphNetworkQuery } from '@/hooks/use-graph-api';
import { useTransactionsQuery } from '@/hooks/use-transactions-api';
import type { GraphNetworkNode, GraphNetworkEdge, AlertRow, CaseRow, CustomerRow } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

type GraphNode = GraphNetworkNode;
type GraphEdge = GraphNetworkEdge;

interface RiskCluster {
  id: string; name: string; nodes: number; riskScore: number; totalValue: number;
  velocityIndex: number; jurisdictions: string[]; primaryType: 'fraud' | 'aml' | 'mixed';
  confidence: number; nodeIds: string[];
}

interface AIInsight {
  severity: 'critical' | 'high' | 'medium' | 'info'; title: string; text: string;
  evidence: string; confidence: number; linkedNodes: string[]; actions: string[];
}

const riskClusters: RiskCluster[] = [
  { id: 'RC1', name: 'High-Velocity Ring', nodes: 12, riskScore: 92, totalValue: 485000, velocityIndex: 8.4, jurisdictions: ['US', 'AE', 'NG'], primaryType: 'fraud', confidence: 94, nodeIds: ['C001', 'A001', 'M001', 'A005'] },
  { id: 'RC2', name: 'Structuring Network', nodes: 8, riskScore: 87, totalValue: 312000, velocityIndex: 6.2, jurisdictions: ['US', 'UK'], primaryType: 'aml', confidence: 88, nodeIds: ['A001', 'C002', 'M001'] },
  { id: 'RC3', name: 'Shared Device Cluster', nodes: 15, riskScore: 78, totalValue: 198000, velocityIndex: 5.1, jurisdictions: ['UK', 'DE'], primaryType: 'fraud', confidence: 81, nodeIds: ['D001', 'D003', 'D004'] },
  { id: 'RC4', name: 'Cross-Border Flow', nodes: 6, riskScore: 71, totalValue: 267000, velocityIndex: 7.3, jurisdictions: ['US', 'AE', 'UK'], primaryType: 'aml', confidence: 76, nodeIds: ['A003', 'C004', 'M002'] },
  { id: 'RC5', name: 'Mule Account Network', nodes: 9, riskScore: 85, totalValue: 156000, velocityIndex: 9.1, jurisdictions: ['US', 'NG'], primaryType: 'mixed', confidence: 91, nodeIds: ['D003', 'C004', 'A003'] },
];

const aiInsights: AIInsight[] = [
  { severity: 'critical', title: 'Circular Transaction Pattern', text: 'Circular fund flow detected between CUST-4521, ACC-7834, and Western Union with layered transactions totaling $95K.', evidence: '3-hop cycle with 34 transactions in 7 days', confidence: 96, linkedNodes: ['C001', 'A001', 'M001'], actions: ['Investigate', 'Create Case'] },
  { severity: 'high', title: 'Multi-Jurisdiction Device Sharing', text: 'Device DEV-x8k2m accessed from 4 high-risk accounts across US and UK jurisdictions within 48 hours.', evidence: 'IP geolocation mismatch on 8 sessions', confidence: 89, linkedNodes: ['D001', 'M002'], actions: ['Flag Device', 'Review Accounts'] },
  { severity: 'medium', title: 'Velocity Anomaly Detected', text: 'MoneyGram node shows 3x increase in connection velocity over past 48 hours compared to baseline.', evidence: 'Baseline: 2.1, Current: 7.1', confidence: 74, linkedNodes: ['M002'], actions: ['Monitor', 'Set Alert'] },
  { severity: 'high', title: 'Structuring Indicators', text: 'Multiple sub-threshold transactions ($9,900-$9,999) detected across linked accounts in AE jurisdiction.', evidence: '6 transactions just below $10K threshold', confidence: 92, linkedNodes: ['A003', 'C004'], actions: ['File SAR', 'Investigate'] },
  { severity: 'info', title: 'New Community Detected', text: 'Three accounts linked via common beneficiary in high-risk jurisdiction (AE) forming new cluster.', evidence: 'Graph modularity change: +0.12', confidence: 68, linkedNodes: ['A003', 'C004', 'A005'], actions: ['Monitor'] },
];

const getNodeColor = (risk: string) => {
  switch (risk) {
    case 'critical': return 'hsl(var(--destructive))';
    case 'high': return 'hsl(25 95% 53%)';
    case 'medium': return 'hsl(var(--warning))';
    default: return 'hsl(var(--success))';
  }
};

const getNodeIcon = (type: string) => {
  switch (type) {
    case 'customer': return User;
    case 'account': return CreditCard;
    case 'device': return Smartphone;
    case 'merchant': return Building2;
    default: return User;
  }
};

const getNodeSize = (t: number) => Math.max(10, Math.min(24, t / 3));
const getBorderWidth = (risk: string) => {
  switch (risk) { case 'critical': return 4; case 'high': return 3; case 'medium': return 2; default: return 1; }
};
const getEdgeThickness = (txnCount: number) => Math.max(1.5, txnCount / 8);

const fmtCurrency = (n: number) => '$' + n.toLocaleString();

const severityColor = (s: string) => {
  switch (s) {
    case 'critical': return 'border-destructive/30 text-destructive';
    case 'high': return 'border-orange-500/30 text-orange-400';
    case 'medium': return 'border-warning/30 text-warning';
    default: return 'border-muted-foreground/30 text-muted-foreground';
  }
};

const riskBadgeClass = (risk: string) => cn(
  'capitalize text-xs',
  risk === 'critical' && 'border-destructive/30 text-destructive',
  risk === 'high' && 'border-orange-500/30 text-orange-400',
  risk === 'medium' && 'border-warning/30 text-warning',
  risk === 'low' && 'border-success/30 text-success'
);

function bfs(edges: GraphEdge[], start: string, end: string): string[] | null {
  const adj: Record<string, string[]> = {};
  for (const e of edges) {
    if (!adj[e.from]) adj[e.from] = [];
    if (!adj[e.to]) adj[e.to] = [];
    adj[e.from].push(e.to);
    adj[e.to].push(e.from);
  }
  const visited = new Set<string>();
  const queue: string[][] = [[start]];
  visited.add(start);
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    if (last === end) return path;
    for (const neighbor of (adj[last] || [])) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return null;
}

const Graph = () => {
  const { toast } = useToast();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [depthLevel, setDepthLevel] = useState([3]);
  const [timeFilter, setTimeFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [edgeTypeFilter, setEdgeTypeFilter] = useState('all');
  const [showFlagged, setShowFlagged] = useState(false);
  const [freezeLayout, setFreezeLayout] = useState(false);
  const [highlightSuspicious, setHighlightSuspicious] = useState(false);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<GraphEdge | null>(null);
  const [pathMode, setPathMode] = useState(false);
  const [pathNodes, setPathNodes] = useState<string[]>([]);
  const [foundPath, setFoundPath] = useState<string[] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Live network payload — keep filters that the server understands on the
  // server, and fall back to "all" so the SVG never goes blank between
  // refetches.
  const graphQuery = useGraphNetworkQuery({
    window: (timeFilter as "24h" | "7d" | "30d" | "all") || "all",
    riskLevel: riskFilter,
    entityType: typeFilter,
    edgeType: edgeTypeFilter,
    limit: 80,
  });
  const allNodes: GraphNode[] = graphQuery.data?.nodes ?? [];
  const allEdges: GraphEdge[] = graphQuery.data?.edges ?? [];
  const serverKpis = graphQuery.data?.kpis;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.2, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.2, 0.4));
  const handleReset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (freezeLayout) return;
    if (e.target === svgRef.current || (e.target as Element).tagName === 'rect') {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  }, [pan, freezeLayout]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && !freezeLayout) setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart, freezeLayout]);

  const handleMouseUp = () => setIsDragging(false);

  const filteredNodes = useMemo(() => allNodes.filter(node => {
    if (searchQuery && !node.label.toLowerCase().includes(searchQuery.toLowerCase()) && !node.id.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (riskFilter !== 'all' && node.risk !== riskFilter) return false;
    if (typeFilter !== 'all' && node.type !== typeFilter) return false;
    if (showFlagged && node.alerts === 0) return false;
    return true;
  }), [allNodes, searchQuery, riskFilter, typeFilter, showFlagged]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map(n => n.id)), [filteredNodes]);

  const visibleEdges = useMemo(() => allEdges.filter(e =>
    filteredNodeIds.has(e.from) && filteredNodeIds.has(e.to) &&
    (timeFilter === 'all' || timeFilter === '30d' || e.isRecent)
  ), [allEdges, filteredNodeIds, timeFilter]);

  const pathEdgeSet = useMemo(() => {
    if (!foundPath || foundPath.length < 2) return new Set<string>();
    const s = new Set<string>();
    for (let i = 0; i < foundPath.length - 1; i++) {
      s.add(`${foundPath[i]}-${foundPath[i + 1]}`);
      s.add(`${foundPath[i + 1]}-${foundPath[i]}`);
    }
    return s;
  }, [foundPath]);

  const highRiskPct = serverKpis?.highRiskPct ?? 0;
  const sharedDeviceCount = serverKpis?.sharedDeviceEdges ?? 0;
  const crossBorderCount = serverKpis?.crossBorderEdges ?? 0;
  const velocitySpikes = serverKpis?.velocitySpikes ?? 0;
  const totalNodes = serverKpis?.totalNodes ?? allNodes.length;
  const totalEdges = serverKpis?.totalEdges ?? allEdges.length;

  const kpis = [
    { label: 'Total Nodes', value: totalNodes, filter: () => { setRiskFilter('all'); setTypeFilter('all'); } },
    { label: 'Connections', value: totalEdges, filter: () => {} },
    { label: 'Communities', value: 5, filter: () => {} },
    { label: 'Risk Clusters', value: riskClusters.length, cls: 'text-destructive', filter: () => setRiskFilter('high') },
    { label: 'Avg Degree', value: totalNodes > 0 ? (totalEdges * 2 / totalNodes).toFixed(1) : '0.0', filter: () => {} },
    { label: 'High-Risk %', value: highRiskPct + '%', cls: 'text-orange-400', filter: () => setRiskFilter('high') },
    { label: 'Suspicious Paths', value: 3, cls: 'text-warning', filter: () => setHighlightSuspicious(true) },
    { label: 'Cross-Border', value: crossBorderCount, filter: () => {} },
    { label: 'Shared Devices', value: sharedDeviceCount, filter: () => setTypeFilter('device') },
    { label: 'Velocity Spikes', value: velocitySpikes, cls: 'text-destructive', filter: () => {} },
  ];

  const handleNodeClick = (node: GraphNode) => {
    if (pathMode) {
      const next = [...pathNodes, node.id].slice(-2);
      setPathNodes(next);
      if (next.length === 2) {
        const p = bfs(allEdges, next[0], next[1]);
        setFoundPath(p);
        if (!p) toast({ title: 'No path found', description: `No connection between ${next[0]} and ${next[1]}` });
        else toast({ title: 'Path found', description: `${p.length} nodes in shortest path` });
      }
      return;
    }
    setSelectedNode(node);
    setDrawerOpen(true);
  };

  const connectedEdges = useMemo(() => {
    if (!selectedNode) return new Set<number>();
    const s = new Set<number>();
    visibleEdges.forEach((e, i) => { if (e.from === selectedNode.id || e.to === selectedNode.id) s.add(i); });
    return s;
  }, [selectedNode, visibleEdges]);

  const getNeighbors = (nodeId: string) => {
    const neighbors: { node: GraphNode; edge: GraphEdge }[] = [];
    for (const e of allEdges) {
      if (e.from === nodeId) { const n = allNodes.find(x => x.id === e.to); if (n) neighbors.push({ node: n, edge: e }); }
      if (e.to === nodeId) { const n = allNodes.find(x => x.id === e.from); if (n) neighbors.push({ node: n, edge: e }); }
    }
    return neighbors;
  };

  // Drawer live data: selected customer profile + their last 20 transactions
  // + open alerts + open cases. Gated on `type === 'customer'` so the drawer
  // doesn't fire useless requests for beneficiary/account nodes (which use a
  // synthetic `BEN-…` id that has no row in the customers table).
  const isCustomerNode = !!selectedNode && selectedNode.type === 'customer';
  const customerDetailQuery = useQuery<CustomerRow>({
    queryKey: ['/api/customers', selectedNode?.id],
    enabled: isCustomerNode && drawerOpen,
  });
  const drawerTxnsQuery = useTransactionsQuery(
    { customerId: selectedNode?.id, limit: 20 },
    { enabled: isCustomerNode && drawerOpen },
  );
  const drawerAlertsQuery = useQuery<AlertRow[]>({
    queryKey: ['/api/alerts'],
    enabled: drawerOpen,
  });
  const drawerCasesQuery = useQuery<CaseRow[]>({
    queryKey: ['/api/cases'],
    enabled: drawerOpen,
  });
  const liveTxns = drawerTxnsQuery.data ?? [];
  const liveAlerts = (drawerAlertsQuery.data ?? []).filter((a) => isCustomerNode && a.customerId === selectedNode?.id).slice(0, 5);
  const liveCases = (drawerCasesQuery.data ?? []).filter((c) => isCustomerNode && c.customerId === selectedNode?.id);

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Network className="h-6 w-6 text-primary" />
            Graph Network Analysis
          </h1>
          <p className="text-muted-foreground text-sm">Visualize entity relationships and detect fraud rings</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant={pathMode ? 'default' : 'outline'} size="sm" onClick={() => { setPathMode(!pathMode); setPathNodes([]); setFoundPath(null); }} data-testid="button-path-mode">
            <Route className="h-4 w-4" /> Find Path
          </Button>
          <Button variant="outline" size="icon" onClick={handleZoomOut} data-testid="button-zoom-out"><ZoomOut className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground w-12 text-center font-mono">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="icon" onClick={handleZoomIn} data-testid="button-zoom-in"><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleReset} data-testid="button-zoom-reset"><Maximize2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {kpis.map((k, i) => (
          <div key={i} className="stat-card text-center cursor-pointer" onClick={k.filter} data-testid={`kpi-${k.label.toLowerCase().replace(/\s+/g, '-')}`}>
            <p className={cn('text-xl font-bold', k.cls)}>{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <Card className="p-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search nodes..." className="pl-9" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} data-testid="input-search" />
            {searchQuery.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg z-50 max-h-48 overflow-auto">
                {allNodes.filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase()) || n.id.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 6).map(n => (
                  <button key={n.id} className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center justify-between" data-testid={`search-suggestion-${n.id}`}
                    onClick={() => { setSearchQuery(''); setSelectedNode(n); setDrawerOpen(true); }}>
                    <span className="flex items-center gap-2">
                      {n.type === 'customer' ? <User className="h-3 w-3" /> : n.type === 'account' ? <CreditCard className="h-3 w-3" /> : n.type === 'device' ? <Smartphone className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                      <span className="font-medium">{n.label}</span>
                      <span className="text-muted-foreground capitalize">{n.type}</span>
                    </span>
                    <Badge variant="outline" className={cn('text-[9px]', n.risk === 'critical' ? 'text-destructive border-destructive/30' : n.risk === 'high' ? 'text-orange-400 border-orange-400/30' : n.risk === 'medium' ? 'text-warning border-warning/30' : 'text-success border-success/30')}>{n.risk}</Badge>
                  </button>
                ))}
                {allNodes.filter(n => n.label.toLowerCase().includes(searchQuery.toLowerCase()) || n.id.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                  <p className="px-3 py-2 text-xs text-muted-foreground">No matching nodes</p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Depth:</span>
            <div className="w-20"><Slider value={depthLevel} onValueChange={setDepthLevel} min={1} max={5} step={1} /></div>
            <span className="font-mono w-4">{depthLevel[0]}</span>
          </div>
          <Select value={timeFilter} onValueChange={setTimeFilter}>
            <SelectTrigger className="w-[100px]" data-testid="select-time"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24h</SelectItem>
              <SelectItem value="7d">7d</SelectItem>
              <SelectItem value="30d">30d</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[110px]" data-testid="select-risk"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risk</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[120px]" data-testid="select-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="customer">Customer</SelectItem>
              <SelectItem value="account">Account</SelectItem>
              <SelectItem value="device">Device</SelectItem>
              <SelectItem value="merchant">Merchant</SelectItem>
            </SelectContent>
          </Select>
          <Select value={edgeTypeFilter} onValueChange={setEdgeTypeFilter}>
            <SelectTrigger className="w-[150px]" data-testid="select-edge-type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Edges</SelectItem>
              <SelectItem value="sent_money">Sent Money</SelectItem>
              <SelectItem value="shared_device">Shared Device</SelectItem>
              <SelectItem value="shared_ip">Shared IP</SelectItem>
              <SelectItem value="shared_address">Shared Address</SelectItem>
              <SelectItem value="common_beneficiary">Common Beneficiary</SelectItem>
              <SelectItem value="linked_account">Case-Linked</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <Switch checked={showFlagged} onCheckedChange={setShowFlagged} data-testid="switch-flagged" />
            <span className="text-xs text-muted-foreground">Flagged</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch checked={freezeLayout} onCheckedChange={setFreezeLayout} data-testid="switch-freeze" />
            <span className="text-xs text-muted-foreground">{freezeLayout ? <Lock className="h-3 w-3 inline" /> : <Unlock className="h-3 w-3 inline" />}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Switch checked={highlightSuspicious} onCheckedChange={setHighlightSuspicious} data-testid="switch-suspicious" />
            <span className="text-xs text-muted-foreground">Suspicious</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 stat-card flex flex-col" style={{ minHeight: 520 }}>
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="text-sm font-medium text-muted-foreground">Network Visualization</h3>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" data-testid="button-export" onClick={() => toast({ title: 'Export started', description: 'Graph data exported to CSV' })}><Download className="h-3 w-3" /> Export</Button>
              <Button variant="outline" size="sm" data-testid="button-create-case" onClick={() => toast({ title: 'Case created' })}><Briefcase className="h-3 w-3" /> Create Case</Button>
              <Button variant="outline" size="sm" data-testid="button-tag" onClick={() => toast({ title: 'Cluster tagged' })}><Tag className="h-3 w-3" /> Tag Cluster</Button>
            </div>
          </div>

          <div ref={containerRef} className="flex-1 rounded-lg bg-muted/10 border border-border relative cursor-grab active:cursor-grabbing"
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            style={{ overflow: 'hidden' }}>
            {graphQuery.isLoading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10" data-testid="graph-loading">
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card/80 px-3 py-2 rounded border border-border">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading network…
                </div>
              </div>
            )}
            {!graphQuery.isLoading && allNodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center" data-testid="graph-empty">
                <div className="text-center max-w-sm">
                  <Network className="h-10 w-10 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No network data</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {graphQuery.isError
                      ? 'Failed to load graph network. Check the database connection.'
                      : 'No customers or transactions match the current filters.'}
                  </p>
                </div>
              </div>
            )}
            <svg ref={svgRef} className="absolute inset-0 w-full h-full" style={{ transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)` }}>
              <rect width="100%" height="100%" fill="transparent" />
              <defs>
                <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto"><polygon points="0 0, 6 2, 0 4" fill="hsl(var(--muted-foreground))" opacity="0.5" /></marker>
              </defs>
              {visibleEdges.map((edge, i) => {
                const fromNode = allNodes.find(n => n.id === edge.from);
                const toNode = allNodes.find(n => n.id === edge.to);
                if (!fromNode || !toNode) return null;
                const isHighRisk = edge.riskScore > 70;
                const isOnPath = pathEdgeSet.has(`${edge.from}-${edge.to}`);
                const isConnected = connectedEdges.has(i);
                const isSuspicious = highlightSuspicious && isHighRisk;
                const strokeColor = isOnPath ? 'hsl(var(--primary))' : isHighRisk ? 'hsl(var(--destructive))' : 'hsl(var(--border))';
                const thickness = isOnPath ? 4 : getEdgeThickness(edge.txnCount);
                const dashArray = edge.relationshipType === 'shared_device' ? '6,4' : isOnPath ? '8,4' : 'none';
                return (
                  <line key={i}
                    x1={`${fromNode.x}%`} y1={`${fromNode.y}%`}
                    x2={`${toNode.x}%`} y2={`${toNode.y}%`}
                    stroke={strokeColor}
                    strokeWidth={thickness}
                    strokeDasharray={dashArray}
                    opacity={isOnPath ? 1 : isConnected ? 0.9 : highlightSuspicious ? (isHighRisk ? 0.9 : 0.1) : 0.35}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoveredEdge(edge)}
                    onMouseLeave={() => setHoveredEdge(null)}
                  >
                    {isOnPath && <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1s" repeatCount="indefinite" />}
                  </line>
                );
              })}
              {filteredNodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const size = getNodeSize(node.transactions30d);
                const borderW = getBorderWidth(node.risk);
                const isPathNode = foundPath?.includes(node.id);
                const isPathPick = pathNodes.includes(node.id);
                return (
                  <g key={node.id} className="cursor-pointer"
                    onClick={() => handleNodeClick(node)}
                    onMouseEnter={() => setHoveredNode(node)}
                    onMouseLeave={() => setHoveredNode(null)}>
                    {(isSelected || isPathNode || isPathPick) && (
                      <circle cx={`${node.x}%`} cy={`${node.y}%`} r={size + 8} fill="none"
                        stroke={isPathNode ? 'hsl(var(--primary))' : getNodeColor(node.risk)} strokeWidth={2} opacity={0.5} />
                    )}
                    <circle cx={`${node.x}%`} cy={`${node.y}%`} r={size}
                      fill={getNodeColor(node.risk)}
                      opacity={isSelected ? 1 : highlightSuspicious && node.risk !== 'high' && node.risk !== 'critical' ? 0.3 : 0.85}
                      stroke={isSelected ? 'hsl(var(--foreground))' : getNodeColor(node.risk)} strokeWidth={borderW} />
                    {node.alerts > 0 && (
                      <g>
                        <circle cx={`${node.x + 2}%`} cy={`${node.y - 3}%`} r={7} fill="hsl(var(--destructive))" />
                        <text x={`${node.x + 2}%`} y={`${node.y - 3}%`} textAnchor="middle" dominantBaseline="central" fontSize="8" fill="white" className="pointer-events-none">{node.alerts}</text>
                      </g>
                    )}
                    <text x={`${node.x}%`} y={`${node.y + 5}%`} textAnchor="middle" fontSize="9" fill="hsl(var(--foreground))" className="pointer-events-none">{node.label}</text>
                  </g>
                );
              })}
            </svg>

            {hoveredNode && !isDragging && (
              <div className="stat-card absolute z-30 pointer-events-none p-3 w-56 shadow-lg"
                style={{ left: `${hoveredNode.x}%`, top: `${hoveredNode.y - 8}%`, transform: 'translate(-50%, -100%)' }}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="font-medium text-sm">{hoveredNode.label}</span>
                  <Badge variant="outline" className={riskBadgeClass(hoveredNode.risk)}>{hoveredNode.risk}</Badge>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Type</span><span className="capitalize">{hoveredNode.type}</span></div>
                  <div className="flex justify-between"><span>Transactions</span><span>{hoveredNode.transactions30d}</span></div>
                  <div className="flex justify-between"><span>Amount</span><span className="font-mono">{fmtCurrency(hoveredNode.totalAmount)}</span></div>
                  <div className="flex justify-between"><span>Open Cases</span><span className={hoveredNode.openCases > 0 ? 'text-destructive' : ''}>{hoveredNode.openCases}</span></div>
                </div>
              </div>
            )}

            {hoveredEdge && !isDragging && (() => {
              const a = allNodes.find(n => n.id === hoveredEdge.from);
              const b = allNodes.find(n => n.id === hoveredEdge.to);
              if (!a || !b) return null;
              const mx = (a.x + b.x) / 2;
              const my = (a.y + b.y) / 2;
              return (
                <div className="stat-card absolute z-30 pointer-events-none p-3 w-52 shadow-lg"
                  style={{ left: `${mx}%`, top: `${my}%`, transform: 'translate(-50%, -100%)' }}>
                  <p className="text-sm font-medium capitalize mb-1.5">{hoveredEdge.relationshipType.replace(/_/g, ' ')}</p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>Transactions</span><span>{hoveredEdge.txnCount}</span></div>
                    <div className="flex justify-between"><span>Amount</span><span className="font-mono">{fmtCurrency(hoveredEdge.totalAmount)}</span></div>
                    <div className="flex justify-between"><span>Risk Score</span><span className={hoveredEdge.riskScore > 70 ? 'text-destructive' : ''}>{hoveredEdge.riskScore}</span></div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-6 mt-3 text-xs flex-wrap">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-muted-foreground font-medium">Risk:</span>
              {[{ label: 'Low', cls: 'bg-success' }, { label: 'Medium', cls: 'bg-warning' }, { label: 'High', cls: 'bg-orange-500' }, { label: 'Critical', cls: 'bg-destructive' }].map(r => (
                <div key={r.label} className="flex items-center gap-1.5"><span className={cn('w-3 h-3 rounded-full', r.cls)} /><span className="text-muted-foreground">{r.label}</span></div>
              ))}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-muted-foreground font-medium">Type:</span>
              {[{ label: 'Customer', Icon: User }, { label: 'Account', Icon: CreditCard }, { label: 'Device', Icon: Smartphone }, { label: 'Merchant', Icon: Building2 }].map(t => (
                <div key={t.label} className="flex items-center gap-1.5"><t.Icon className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">{t.label}</span></div>
              ))}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-muted-foreground font-medium">Edge:</span>
              <div className="flex items-center gap-1.5"><span className="w-6 border-t-2 border-dashed border-muted-foreground" /><span className="text-muted-foreground">Shared Device</span></div>
              <div className="flex items-center gap-1.5"><span className="w-6 border-t-2 border-destructive" /><span className="text-muted-foreground">High Risk</span></div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bot className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-medium">AI Network Insights</h3>
            </div>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {aiInsights.map((insight, i) => (
                <div key={i} className={cn('p-2.5 rounded-lg border text-xs', insight.severity === 'critical' && 'border-destructive/30 bg-destructive/5', insight.severity === 'high' && 'border-orange-500/20 bg-orange-500/5', insight.severity === 'medium' && 'border-warning/20 bg-warning/5', insight.severity === 'info' && 'border-border')}>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={cn('text-xs capitalize', severityColor(insight.severity))}>{insight.severity}</Badge>
                    <span className="font-medium text-xs">{insight.title}</span>
                  </div>
                  <p className="text-muted-foreground leading-relaxed mb-1.5">{insight.text}</p>
                  <p className="text-muted-foreground/70 italic text-[11px] mb-2">{insight.evidence}</p>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{insight.confidence}% confidence</Badge>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => { const n = allNodes.find(x => x.id === insight.linkedNodes[0]); if (n) { setSelectedNode(n); setDrawerOpen(true); } }} data-testid={`button-insight-view-${i}`}>
                        <Eye className="h-3 w-3" /> View
                      </Button>
                      <Button variant="ghost" size="sm" className="text-[11px]" onClick={() => toast({ title: 'Case created from insight' })} data-testid={`button-insight-case-${i}`}>
                        <Briefcase className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <h3 className="text-sm font-medium">Risk Clusters</h3>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {riskClusters.map((cluster) => (
                <div key={cluster.id} className="p-2.5 rounded-lg bg-muted/30 border border-border cursor-pointer hover-elevate" onClick={() => { setRiskFilter('high'); toast({ title: `Cluster: ${cluster.name}`, description: `${cluster.nodes} nodes, ${fmtCurrency(cluster.totalValue)} total value` }); }} data-testid={`cluster-${cluster.id}`}>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <div>
                      <p className="font-medium text-xs">{cluster.name}</p>
                      <p className="text-xs text-muted-foreground">{cluster.nodes} nodes</p>
                    </div>
                    <Badge variant="outline" className={cn('text-xs', cluster.riskScore >= 80 ? 'border-destructive/30 text-destructive' : 'border-warning/30 text-warning')}>{cluster.riskScore}</Badge>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    <Badge variant="secondary" className="text-[10px] capitalize">{cluster.primaryType}</Badge>
                    <span className="text-[10px] text-muted-foreground">{fmtCurrency(cluster.totalValue)}</span>
                    <span className="text-[10px] text-muted-foreground">v:{cluster.velocityIndex}</span>
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {cluster.jurisdictions.map(j => (
                      <Badge key={j} variant="outline" className="text-[10px]">{j}</Badge>
                    ))}
                    <span className="text-[10px] text-muted-foreground ml-auto">{cluster.confidence}%</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
          {selectedNode && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-3">
                  {(() => { const Icon = getNodeIcon(selectedNode.type); return <div className="p-2 rounded-lg bg-muted"><Icon className="h-5 w-5 text-primary" /></div>; })()}
                  <div>
                    <SheetTitle>{selectedNode.label}</SheetTitle>
                    <SheetDescription className="flex items-center gap-2 mt-0.5">
                      <span className="capitalize">{selectedNode.type}</span>
                      <Badge variant="outline" className={riskBadgeClass(selectedNode.risk)}>{selectedNode.risk}</Badge>
                    </SheetDescription>
                  </div>
                </div>
              </SheetHeader>
              <Separator className="my-4" />
              <Tabs defaultValue="overview">
                <TabsList className="w-full">
                  <TabsTrigger value="overview" className="flex-1" data-testid="tab-overview">Overview</TabsTrigger>
                  <TabsTrigger value="transactions" className="flex-1" data-testid="tab-transactions">Txns</TabsTrigger>
                  <TabsTrigger value="connections" className="flex-1" data-testid="tab-connections">Links</TabsTrigger>
                  <TabsTrigger value="cases" className="flex-1" data-testid="tab-cases">Cases</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Type', value: selectedNode.type },
                      { label: 'Risk Score', value: selectedNode.riskScore + '/100' },
                      { label: 'Jurisdiction', value: selectedNode.jurisdiction },
                      { label: 'Velocity', value: selectedNode.velocity.toFixed(1) },
                      { label: 'Connections', value: selectedNode.connections },
                      { label: 'Last Activity', value: '2h ago' },
                    ].map(item => (
                      <div key={item.label} className="stat-card p-3">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="text-sm font-medium capitalize">{item.value}</p>
                      </div>
                    ))}
                  </div>
                  {isCustomerNode && customerDetailQuery.data && (
                    <div className="rounded-lg bg-muted/30 border border-border p-3 text-xs space-y-1" data-testid="drawer-kyc-summary">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Customer Type</span>
                        <span className="font-medium capitalize">{customerDetailQuery.data.type}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">KYC Status</span>
                        <Badge variant="outline" className="text-[10px] capitalize">{customerDetailQuery.data.kycStatus ?? 'unknown'}</Badge>
                      </div>
                      {(customerDetailQuery.data.pepFlag || customerDetailQuery.data.sanctionFlag || customerDetailQuery.data.fraudRiskFlag) && (
                        <div className="flex items-center gap-1 flex-wrap pt-1">
                          {customerDetailQuery.data.pepFlag && <Badge variant="outline" className="text-[10px] border-purple-400/40 text-purple-400">PEP</Badge>}
                          {customerDetailQuery.data.sanctionFlag && <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive">Sanction</Badge>}
                          {customerDetailQuery.data.fraudRiskFlag && <Badge variant="outline" className="text-[10px] border-orange-400/40 text-orange-400">Fraud Risk</Badge>}
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5 text-primary" /> Related Alerts</h4>
                    <div className="space-y-1.5" data-testid="drawer-related-alerts">
                      {drawerAlertsQuery.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
                      {!drawerAlertsQuery.isLoading && liveAlerts.length === 0 && (
                        <p className="text-xs text-muted-foreground italic">No alerts for this entity</p>
                      )}
                      {liveAlerts.map((a) => (
                        <div key={a.id} className="text-xs p-2 rounded-md bg-muted/50 border border-border flex items-center justify-between gap-2" data-testid={`drawer-alert-${a.id}`}>
                          <span className="truncate">{a.description ?? a.type}</span>
                          <Badge variant="outline" className={cn('text-[10px]', riskBadgeClass(a.severity ?? 'medium'))}>{a.severity}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="transactions" className="mt-4">
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left p-2 font-medium text-muted-foreground">ID</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Amount</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Date</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Risk</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Cpty</th>
                        </tr>
                      </thead>
                      <tbody data-testid="drawer-txns">
                        {drawerTxnsQuery.isLoading && (
                          <tr><td colSpan={5} className="p-3 text-center text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin inline" /> Loading…</td></tr>
                        )}
                        {!drawerTxnsQuery.isLoading && liveTxns.length === 0 && (
                          <tr><td colSpan={5} className="p-3 text-center text-muted-foreground italic">No transactions for this entity</td></tr>
                        )}
                        {liveTxns.map((t) => (
                          <tr key={t.id} className="border-t border-border" data-testid={`drawer-txn-${t.id}`}>
                            <td className="p-2 font-mono truncate max-w-[100px]">{t.id}</td>
                            <td className="p-2 text-right font-mono">{fmtCurrency(t.amount)}</td>
                            <td className="p-2 text-muted-foreground">{new Date(t.timestamp).toLocaleDateString()}</td>
                            <td className="p-2"><Badge variant="outline" className={cn('text-[10px]', riskBadgeClass(t.riskLevel))}>{t.riskLevel}</Badge></td>
                            <td className="p-2 text-muted-foreground truncate max-w-[80px]">{t.beneficiaryAccount ?? t.merchantName ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="outline" size="sm" className="mt-3 w-full" data-testid="button-txn-case" onClick={() => toast({ title: 'Case created from transactions' })}>
                    <Briefcase className="h-3 w-3" /> Create Case from Transactions
                  </Button>
                </TabsContent>
                <TabsContent value="connections" className="mt-4">
                  <div className="space-y-2">
                    {getNeighbors(selectedNode.id).map(({ node: n, edge: e }, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-muted/30 border border-border flex items-center justify-between gap-2 cursor-pointer hover-elevate" onClick={() => { setSelectedNode(n); }} data-testid={`connection-${n.id}`}>
                        <div className="flex items-center gap-2">
                          {(() => { const I = getNodeIcon(n.type); return <I className="h-3.5 w-3.5 text-muted-foreground" />; })()}
                          <div>
                            <p className="text-xs font-medium">{n.label}</p>
                            <p className="text-[10px] text-muted-foreground capitalize">{e.relationshipType.replace(/_/g, ' ')}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{e.txnCount} txns</span>
                          <Badge variant="outline" className={cn('text-[10px]', riskBadgeClass(n.risk))}>{n.risk}</Badge>
                        </div>
                      </div>
                    ))}
                    {getNeighbors(selectedNode.id).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No direct connections</p>}
                  </div>
                </TabsContent>
                <TabsContent value="cases" className="mt-4">
                  <div className="space-y-2" data-testid="drawer-cases">
                    {drawerCasesQuery.isLoading && <p className="text-xs text-muted-foreground text-center py-4"><Loader2 className="h-3 w-3 animate-spin inline" /> Loading…</p>}
                    {!drawerCasesQuery.isLoading && liveCases.map((c) => (
                      <div key={c.id} className="p-3 rounded-lg bg-muted/30 border border-border" data-testid={`drawer-case-${c.id}`}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-medium font-mono">{c.id}</span>
                          <Badge variant="outline" className={cn('text-[10px]', c.priority === 'critical' ? 'border-destructive/30 text-destructive' : c.priority === 'high' ? 'border-orange-500/30 text-orange-400' : 'border-border')}>{c.priority}</Badge>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="capitalize">{c.status}</span>
                          <span>{c.assignedTo ?? 'Unassigned'}</span>
                        </div>
                      </div>
                    ))}
                    {!drawerCasesQuery.isLoading && liveCases.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No cases for this entity</p>}
                  </div>
                </TabsContent>
              </Tabs>
              <Separator className="my-4" />
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" className="flex-1" data-testid="button-investigate" onClick={() => toast({ title: 'Investigation started', description: `Investigating ${selectedNode.label}` })}><Search className="h-3 w-3" /> Investigate</Button>
                <Button variant="outline" size="sm" className="flex-1" data-testid="button-drawer-case" onClick={() => toast({ title: 'Case created' })}><Briefcase className="h-3 w-3" /> Create Case</Button>
                <Button variant="outline" size="sm" data-testid="button-sar" onClick={() => toast({ title: 'SAR draft initiated' })}><FileText className="h-3 w-3" /> Draft SAR</Button>
                <Button variant="outline" size="sm" data-testid="button-add-graph" onClick={() => toast({ title: 'Added to graph' })}><Plus className="h-3 w-3" /> Add</Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Graph;
