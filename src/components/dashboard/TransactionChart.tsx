import { useMemo } from 'react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { generateTimeSeriesData } from '@/lib/mock-data';

interface TransactionChartProps {
  title: string;
  metric: 'transactions' | 'volume' | 'fraud_rate' | 'alerts';
  days?: number;
}

export const TransactionChart = ({ title, metric, days = 7 }: TransactionChartProps) => {
  const data = useMemo(() => generateTimeSeriesData(days, metric), [days, metric]);
  
  const formatValue = (value: number) => {
    if (metric === 'volume') {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (metric === 'fraud_rate') {
      return `${value}%`;
    }
    return value.toLocaleString();
  };
  
  const getGradientColors = () => {
    switch (metric) {
      case 'fraud_rate':
        return { start: 'hsl(var(--destructive))', end: 'hsl(var(--destructive) / 0.1)' };
      case 'alerts':
        return { start: 'hsl(var(--warning))', end: 'hsl(var(--warning) / 0.1)' };
      default:
        return { start: 'hsl(var(--primary))', end: 'hsl(var(--primary) / 0.1)' };
    }
  };
  
  const colors = getGradientColors();
  
  return (
    <div className="stat-card h-[300px]">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <defs>
            <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.start} stopOpacity={0.4} />
              <stop offset="95%" stopColor={colors.end} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis 
            dataKey="label" 
            axisLine={false} 
            tickLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            tickFormatter={formatValue}
          />
          <Tooltip 
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
            }}
            labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
            formatter={(value: number) => [formatValue(value), title]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={colors.start}
            strokeWidth={2}
            fill={`url(#gradient-${metric})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};
