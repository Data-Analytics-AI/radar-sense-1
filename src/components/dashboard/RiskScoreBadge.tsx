import { cn } from '@/lib/utils';
import { RiskLevel } from '@/types';

interface RiskScoreBadgeProps {
  score: number;
  level: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
  showScore?: boolean;
}

export const RiskScoreBadge = ({ 
  score, 
  level, 
  size = 'md', 
  showScore = true 
}: RiskScoreBadgeProps) => {
  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'h-6 px-2 text-xs';
      case 'lg':
        return 'h-10 px-4 text-base';
      default:
        return 'h-8 px-3 text-sm';
    }
  };
  
  const getLevelClasses = () => {
    switch (level) {
      case 'low':
        return 'risk-low';
      case 'medium':
        return 'risk-medium';
      case 'high':
        return 'risk-high';
      case 'critical':
        return 'risk-critical';
    }
  };
  
  const getLabel = () => {
    switch (level) {
      case 'low':
        return 'Low';
      case 'medium':
        return 'Medium';
      case 'high':
        return 'High';
      case 'critical':
        return 'Critical';
    }
  };
  
  return (
    <div className={cn(
      'inline-flex items-center gap-1.5 rounded-md border font-semibold',
      getSizeClasses(),
      getLevelClasses()
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        level === 'low' && 'bg-success',
        level === 'medium' && 'bg-warning',
        level === 'high' && 'bg-orange-500',
        level === 'critical' && 'bg-destructive animate-pulse'
      )} />
      {showScore ? (
        <span>{score}</span>
      ) : (
        <span>{getLabel()}</span>
      )}
    </div>
  );
};
