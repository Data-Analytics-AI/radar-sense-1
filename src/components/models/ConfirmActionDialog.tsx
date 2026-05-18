import { useEffect, useState } from 'react';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Loader2 } from 'lucide-react';

interface ConfirmActionDialogProps {
  open: boolean;
  onClose: () => void;
  action: 'promote' | 'rollback' | 'threshold';
  modelName: string;
  details?: string;
  initialThreshold?: number;
  isPending?: boolean;
  onConfirm: (payload: { reason: string; threshold?: number }) => void;
}

const actionConfig = {
  promote: { title: 'Promote to Production', description: 'This will deploy the model to production and route live traffic to it.', buttonLabel: 'Confirm Promote', variant: 'default' as const },
  rollback: { title: 'Rollback Model', description: 'This will revert to the previous production model version. Current model will be moved to staging.', buttonLabel: 'Confirm Rollback', variant: 'destructive' as const },
  threshold: { title: 'Change Threshold', description: 'Adjusting the scoring threshold will impact alert volume and detection rates in production.', buttonLabel: 'Confirm Change', variant: 'default' as const },
};

export default function ConfirmActionDialog({ open, onClose, action, modelName, details, initialThreshold, isPending, onConfirm }: ConfirmActionDialogProps) {
  const [reason, setReason] = useState('');
  const [threshold, setThreshold] = useState<string>(initialThreshold !== undefined ? String(initialThreshold) : '0.5');
  const config = actionConfig[action];

  useEffect(() => {
    if (open) {
      setReason('');
      setThreshold(initialThreshold !== undefined ? String(initialThreshold) : '0.5');
    }
  }, [open, initialThreshold]);

  const valid = reason.trim().length > 0 && (action !== 'threshold' || (!Number.isNaN(parseFloat(threshold)) && parseFloat(threshold) >= 0 && parseFloat(threshold) <= 1));

  const handleConfirm = () => {
    if (!valid) return;
    onConfirm(action === 'threshold' ? { reason, threshold: parseFloat(threshold) } : { reason });
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && !isPending && onClose()}>
      <AlertDialogContent data-testid={`confirm-${action}-dialog`}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {config.title}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {config.description}
            {details && <span className="block mt-1 text-foreground font-medium">{details}</span>}
            <span className="block mt-1 text-foreground font-medium">{modelName}</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-2 space-y-3">
          {action === 'threshold' && (
            <div>
              <Label>New threshold (0 - 1)</Label>
              <Input
                type="number" step="0.01" min="0" max="1"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="mt-1"
                data-testid="input-threshold-value"
              />
            </div>
          )}
          <div>
            <Label>Reason (required)</Label>
            <Textarea
              placeholder="Provide a reason for this action..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1"
              data-testid={`input-${action}-reason`}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending} data-testid={`button-cancel-${action}`}>Cancel</AlertDialogCancel>
          <Button
            variant={config.variant}
            onClick={handleConfirm}
            disabled={isPending || !valid}
            data-testid={`button-confirm-${action}`}
          >
            {isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Processing...</> : config.buttonLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
