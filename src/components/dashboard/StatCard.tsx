import { ReactNode, useState } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: ReactNode;
  trend?: {
    value: number;
    label: string;
  };
  variant?: 'default' | 'success' | 'warning' | 'danger';
  details?: Record<string, string | number>;
  className?: string;
}

export const StatCard = ({ 
  title, 
  value, 
  subtitle, 
  icon, 
  trend, 
  variant = 'default',
  details,
  className 
}: StatCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const getTrendIcon = () => {
    if (!trend) return null;
    if (trend.value > 0) return <TrendingUp className="h-3 w-3" />;
    if (trend.value < 0) return <TrendingDown className="h-3 w-3" />;
    return <Minus className="h-3 w-3" />;
  };
  
  const getTrendColor = () => {
    if (!trend) return '';
    if (trend.value > 0) return 'text-success';
    if (trend.value < 0) return 'text-destructive';
    return 'text-muted-foreground';
  };
  
  const getVariantStyles = () => {
    switch (variant) {
      case 'success':
        return 'border-success/30 bg-gradient-to-br from-success/5 to-transparent';
      case 'warning':
        return 'border-warning/30 bg-gradient-to-br from-warning/5 to-transparent';
      case 'danger':
        return 'border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent';
      default:
        return 'border-border';
    }
  };
  
  const getIconBg = () => {
    switch (variant) {
      case 'success':
        return 'bg-success/10 text-success';
      case 'warning':
        return 'bg-warning/10 text-warning';
      case 'danger':
        return 'bg-destructive/10 text-destructive';
      default:
        return 'bg-primary/10 text-primary';
    }
  };
  
  return (
    <div className={cn(
      'stat-card group',
      getVariantStyles(),
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight animate-count">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className={cn('flex items-center gap-1 text-xs font-medium', getTrendColor())}>
              {getTrendIcon()}
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn('p-3 rounded-lg', getIconBg())}>
          {icon}
        </div>
      </div>
      {details && (
        <button
          data-testid={`button-expand-${title.toLowerCase().replace(/\s+/g, '-')}`}
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground mt-2 hover-elevate rounded-md px-1 py-0.5 -ml-1"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          <span>{expanded ? 'Less' : 'Details'}</span>
        </button>
      )}
      {details && expanded && (
        <div
          data-testid={`details-panel-${title.toLowerCase().replace(/\s+/g, '-')}`}
          className="mt-2 pt-2 border-t border-border/50 grid grid-cols-2 gap-x-4 gap-y-1"
        >
          {Object.entries(details).map(([key, val]) => (
            <div key={key} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate mr-1">{key}</span>
              <span className="font-medium tabular-nums">{val}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
