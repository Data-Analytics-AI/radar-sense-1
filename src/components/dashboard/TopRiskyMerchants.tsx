import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const data = [
  { name: 'Casino Royale', transactions: 156, riskScore: 78 },
  { name: 'Western Union', transactions: 234, riskScore: 72 },
  { name: 'Crypto Exchange', transactions: 89, riskScore: 68 },
  { name: 'Online Gambling', transactions: 67, riskScore: 65 },
  { name: 'Wire Transfer Co', transactions: 45, riskScore: 58 },
];

export const TopRiskyMerchants = () => {
  const getBarColor = (riskScore: number) => {
    if (riskScore >= 75) return 'hsl(var(--risk-critical))';
    if (riskScore >= 50) return 'hsl(var(--risk-high))';
    if (riskScore >= 25) return 'hsl(var(--risk-medium))';
    return 'hsl(var(--risk-low))';
  };
  
  return (
    <div className="stat-card h-[300px]">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Top Risky Merchants</h3>
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <XAxis type="number" hide />
          <YAxis 
            type="category" 
            dataKey="name" 
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
            width={100}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
            }}
            formatter={(value: number, name: string) => {
              if (name === 'transactions') return [value, 'Flagged Transactions'];
              return [value, 'Risk Score'];
            }}
          />
          <Bar 
            dataKey="transactions" 
            radius={[0, 4, 4, 0]}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={getBarColor(entry.riskScore)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
