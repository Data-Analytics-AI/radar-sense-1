import { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Rule } from '@/types';

interface CreateRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRuleCreated?: (rule: Partial<Rule>) => void;
}

type RuleType = 'velocity' | 'amount' | 'geographic' | 'time' | 'device' | 'blacklist';
type RuleCategory = 'fraud' | 'aml';

export function CreateRuleDialog({ open, onOpenChange, onRuleCreated }: CreateRuleDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: '' as RuleType | '',
    category: '' as RuleCategory | '',
    condition: '',
    threshold: '',
    priority: '2',
    isActive: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.type || !formData.category || !formData.condition || !formData.threshold) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const newRule: Partial<Rule> = {
      id: `RULE-${Date.now()}`,
      name: formData.name,
      description: formData.description,
      type: formData.type as RuleType,
      category: formData.category as RuleCategory,
      condition: formData.condition,
      threshold: parseFloat(formData.threshold.replace(/[^0-9.]/g, '')) || 0,
      priority: parseInt(formData.priority),
      isActive: formData.isActive,
      triggeredCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onRuleCreated?.(newRule);
    
    toast({
      title: "Rule Created",
      description: `Rule "${formData.name}" has been created successfully`,
    });
    
    setFormData({
      name: '',
      description: '',
      type: '',
      category: '',
      condition: '',
      threshold: '',
      priority: '2',
      isActive: true,
    });
    setIsSubmitting(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Create Detection Rule</DialogTitle>
          <DialogDescription>
            Define a new fraud or AML detection rule for transaction monitoring.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Rule Name *</Label>
            <Input
              id="name"
              placeholder="e.g., High-value international transfer"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Describe what this rule detects..."
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Rule Type *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value: RuleType) => setFormData(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="velocity">Velocity</SelectItem>
                  <SelectItem value="amount">Amount</SelectItem>
                  <SelectItem value="geographic">Geographic</SelectItem>
                  <SelectItem value="time">Time-based</SelectItem>
                  <SelectItem value="device">Device</SelectItem>
                  <SelectItem value="blacklist">Blacklist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value: RuleCategory) => setFormData(prev => ({ ...prev, category: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fraud">Fraud Detection</SelectItem>
                  <SelectItem value="aml">AML Monitoring</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="condition">Condition *</Label>
              <Input
                id="condition"
                placeholder="e.g., amount > threshold"
                value={formData.condition}
                onChange={(e) => setFormData(prev => ({ ...prev, condition: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="threshold">Threshold *</Label>
              <Input
                id="threshold"
                placeholder="e.g., $10,000"
                value={formData.threshold}
                onChange={(e) => setFormData(prev => ({ ...prev, threshold: e.target.value }))}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select 
                value={formData.priority} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, priority: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">High (Priority 1)</SelectItem>
                  <SelectItem value="2">Medium (Priority 2)</SelectItem>
                  <SelectItem value="3">Low (Priority 3)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Active on Creation</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch
                  checked={formData.isActive}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                />
                <span className="text-sm text-muted-foreground">
                  {formData.isActive ? 'Rule will be active' : 'Rule will be disabled'}
                </span>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
