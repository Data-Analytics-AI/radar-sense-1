import { cn } from '@/lib/utils';
import { AlertStatus } from '@/types';

interface AlertStatusBadgeProps {
  status: AlertStatus;
}

export const AlertStatusBadge = ({ status }: AlertStatusBadgeProps) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'open':
        return {
          label: 'Open',
          className: 'bg-destructive/20 text-destructive border-destructive/30'
        };
      case 'under_investigation':
        return {
          label: 'Investigating',
          className: 'bg-warning/20 text-warning border-warning/30'
        };
      case 'escalated':
        return {
          label: 'Escalated',
          className: 'bg-orange-500/20 text-orange-400 border-orange-500/30'
        };
      case 'closed':
        return {
          label: 'Closed',
          className: 'bg-muted text-muted-foreground border-border'
        };
    }
  };
  
  const config = getStatusConfig();
  
  return (
    <span className={cn(
      'inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium border',
      config.className
    )}>
      {config.label}
    </span>
  );
};
