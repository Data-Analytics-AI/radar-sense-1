import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { getRiskDistribution } from '@/lib/mock-data';

export const RiskDistributionChart = () => {
  const data = getRiskDistribution();
  
  const COLORS = [
    'hsl(var(--risk-low))',
    'hsl(var(--risk-medium))',
    'hsl(var(--risk-high))',
    'hsl(var(--risk-critical))'
  ];
  
  return (
    <div className="stat-card h-[300px]">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Risk Distribution</h3>
      <ResponsiveContainer width="100%" height="85%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={COLORS[index % COLORS.length]}
                stroke="hsl(var(--background))"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--popover))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3)'
            }}
            formatter={(value: number) => [`${value}%`, 'Percentage']}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => (
              <span className="text-xs text-muted-foreground">{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};
