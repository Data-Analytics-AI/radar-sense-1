import { DetailsDrawer } from '@/components/DetailsDrawer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ExternalLink, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DrawerSection {
  label: string;
  value: string | number;
  highlight?: boolean;
}

interface DrawerAction {
  label: string;
  linkTo?: string;
  onClick?: () => void;
  variant?: 'default' | 'outline';
}

interface AnalyticsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;
  definition?: string;
  sections?: DrawerSection[];
  breakdown?: { label: string; value: number; total?: number }[];
  drivers?: { label: string; value: string | number; trend?: number }[];
  actions?: DrawerAction[];
  children?: React.ReactNode;
}

export function AnalyticsDrawer({ open, onOpenChange, title, subtitle, definition, sections, breakdown, drivers, actions, children }: AnalyticsDrawerProps) {
  const navigate = useNavigate();
  return (
    <DetailsDrawer open={open} onOpenChange={onOpenChange} title={title} description={subtitle}>
      <div className="space-y-5">
        {definition && (
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
            <p className="text-xs font-medium text-muted-foreground mb-1">Definition</p>
            <p className="text-xs text-foreground">{definition}</p>
          </div>
        )}
        {sections && sections.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {sections.map(s => (
              <div key={s.label} className="p-2.5 rounded-lg bg-muted/20">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
                <p className={cn("text-sm font-semibold mt-0.5", s.highlight && "text-destructive")}>{s.value}</p>
              </div>
            ))}
          </div>
        )}
        {breakdown && breakdown.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Breakdown</p>
            <div className="space-y-2">
              {breakdown.map(b => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="text-xs w-28 truncate">{b.label}</span>
                  <div className="flex-1 bg-muted/30 rounded-full h-1.5">
                    <div className="bg-primary rounded-full h-1.5 transition-all" style={{ width: `${b.total ? (b.value / b.total) * 100 : b.value}%` }} />
                  </div>
                  <span className="text-xs font-mono w-12 text-right">{typeof b.value === 'number' ? b.value.toLocaleString() : b.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {drivers && drivers.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Top Drivers</p>
            <div className="space-y-1.5">
              {drivers.map(d => (
                <div key={d.label} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/20 text-xs">
                  <span>{d.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-medium">{d.value}</span>
                    {d.trend !== undefined && (
                      <Badge variant="secondary" className={cn("text-[9px]", d.trend > 0 ? "text-destructive" : "text-success")}>
                        {d.trend > 0 ? '+' : ''}{d.trend}%
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {children}
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
            {actions.map(a => (
              <Button key={a.label} variant={a.variant || 'outline'} size="sm" className="text-xs"
                onClick={() => { a.onClick?.(); if (a.linkTo) navigate(a.linkTo); }}
                data-testid={`drawer-action-${a.label.toLowerCase().replace(/\s+/g,'-')}`}>
                {a.linkTo ? <ExternalLink className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
                {a.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </DetailsDrawer>
  );
}
