import { useState, useMemo } from 'react';
import type { AnalyticsData } from '@/lib/analytics-data';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AnalyticsDrawer } from '@/components/analytics/AnalyticsDrawer';
import { ChevronRight, Globe, Wifi, Plane, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeographyTabProps {
  data: AnalyticsData['geography'];
}

type MetricKey = 'txnVolume' | 'alertRate' | 'fraudRate' | 'amlRiskScore';
const metrics: { key: MetricKey; label: string }[] = [
  { key: 'txnVolume', label: 'Transaction Volume' },
  { key: 'alertRate', label: 'Alert Rate' },
  { key: 'fraudRate', label: 'Fraud Rate' },
  { key: 'amlRiskScore', label: 'AML Risk Score' },
];

type DrawerState = { open: boolean; title: string; subtitle?: string; sections?: { label: string; value: string | number; highlight?: boolean }[]; actions?: { label: string; linkTo?: string; variant?: 'default' | 'outline' }[] };

const formatMetric = (key: MetricKey, v: number) => {
  if (key === 'txnVolume') return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(v);
  if (key === 'alertRate' || key === 'fraudRate') return `${v}%`;
  return String(v);
};

const getIntensity = (value: number, min: number, max: number) => {
  if (max === min) return 0.3;
  return 0.15 + ((value - min) / (max - min)) * 0.85;
};

export function GeographyTab({ data }: GeographyTabProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('amlRiskScore');
  const [drawer, setDrawer] = useState<DrawerState>({ open: false, title: '' });

  const sorted = useMemo(() =>
    [...data.countries].sort((a, b) => b[selectedMetric] - a[selectedMetric]),
    [data.countries, selectedMetric]
  );

  const metricValues = useMemo(() => sorted.map(c => c[selectedMetric]), [sorted, selectedMetric]);
  const minVal = Math.min(...metricValues);
  const maxVal = Math.max(...metricValues);

  const openCountryDrawer = (c: AnalyticsData['geography']['countries'][0]) => {
    setDrawer({
      open: true, title: c.name, subtitle: c.code,
      sections: [
        { label: 'Txn Volume', value: c.txnVolume.toLocaleString() },
        { label: 'Alert Rate', value: `${c.alertRate}%`, highlight: c.alertRate > 5 },
        { label: 'Fraud Rate', value: `${c.fraudRate}%`, highlight: c.fraudRate > 0.5 },
        { label: 'AML Risk Score', value: c.amlRiskScore, highlight: c.amlRiskScore >= 70 },
        { label: 'Top Merchant', value: c.topMerchant },
        { label: 'Top Channel', value: c.topChannel },
      ],
      actions: [{ label: 'View Transactions', linkTo: '/transactions' }],
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {metrics.map(m => (
          <Button key={m.key} size="sm" variant={selectedMetric === m.key ? 'default' : 'outline'}
            className={cn("text-xs toggle-elevate", selectedMetric === m.key && "toggle-elevated")}
            onClick={() => setSelectedMetric(m.key)} data-testid={`metric-toggle-${m.key}`}>
            {m.label}
          </Button>
        ))}
      </div>

      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Country Risk Heatmap</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sorted.map(c => {
            const intensity = getIntensity(c[selectedMetric], minVal, maxVal);
            const isHigh = intensity > 0.6;
            return (
              <div key={c.code}
                className="relative rounded-lg border border-border p-4 cursor-pointer hover-elevate transition-colors"
                style={{ backgroundColor: `hsl(var(--destructive) / ${(intensity * 0.25).toFixed(2)})` }}
                onClick={() => openCountryDrawer(c)} data-testid={`country-card-${c.code}`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-sm font-medium">{c.name}</span>
                  <Badge variant={isHigh ? 'destructive' : 'secondary'} className="text-[10px]">{c.code}</Badge>
                </div>
                <p className="text-2xl font-bold">{formatMetric(selectedMetric, c[selectedMetric])}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{metrics.find(m => m.key === selectedMetric)?.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Country Rankings</p>
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left p-2.5 font-medium">Country</th>
                <th className="text-right p-2.5 font-medium">Txn Volume</th>
                <th className="text-right p-2.5 font-medium">Alert Rate</th>
                <th className="text-right p-2.5 font-medium">Fraud Rate</th>
                <th className="text-right p-2.5 font-medium">AML Risk</th>
                <th className="text-left p-2.5 font-medium hidden lg:table-cell">Top Merchant</th>
                <th className="text-left p-2.5 font-medium hidden lg:table-cell">Top Channel</th>
                <th className="w-8 p-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(c => (
                <tr key={c.code} className="border-b border-border/50 cursor-pointer hover-elevate"
                  onClick={() => openCountryDrawer(c)} data-testid={`country-row-${c.code}`}>
                  <td className="p-2.5 font-medium">{c.name}</td>
                  <td className="p-2.5 text-right font-mono">{c.txnVolume.toLocaleString()}</td>
                  <td className="p-2.5 text-right font-mono">{c.alertRate}%</td>
                  <td className="p-2.5 text-right font-mono">{c.fraudRate}%</td>
                  <td className="p-2.5 text-right">
                    <Badge variant={c.amlRiskScore >= 70 ? 'destructive' : c.amlRiskScore >= 40 ? 'secondary' : 'outline'} className="text-[10px]">
                      {c.amlRiskScore}
                    </Badge>
                  </td>
                  <td className="p-2.5 hidden lg:table-cell text-muted-foreground">{c.topMerchant}</td>
                  <td className="p-2.5 hidden lg:table-cell text-muted-foreground capitalize">{c.topChannel}</td>
                  <td className="p-2.5"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2 text-muted-foreground">Geo Anomalies</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card" data-testid="stat-ip-mismatch">
            <div className="flex items-center gap-2 mb-1">
              <Wifi className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">IP vs Country Mismatch</p>
            </div>
            <p className="text-2xl font-bold">{data.geoAnomalies.ipMismatchRate}%</p>
          </div>
          <div className="stat-card" data-testid="stat-impossible-travel">
            <div className="flex items-center gap-2 mb-1">
              <Plane className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Impossible Travel</p>
            </div>
            <p className="text-2xl font-bold">{data.geoAnomalies.impossibleTravel.toLocaleString()}</p>
          </div>
          <div className="stat-card" data-testid="stat-first-seen-country">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">First-Seen Country</p>
            </div>
            <p className="text-2xl font-bold">{data.geoAnomalies.firstSeenCountry.toLocaleString()}</p>
          </div>
        </div>
      </div>

      <AnalyticsDrawer open={drawer.open} onOpenChange={o => setDrawer(prev => ({ ...prev, open: o }))}
        title={drawer.title} subtitle={drawer.subtitle} sections={drawer.sections} actions={drawer.actions} />
    </div>
  );
}
