import { Badge } from '@/components/ui/badge';
import {
    CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { useEffect, useState } from 'react';

export interface RuleHit {
    id: number;
    name: string;
    rule_type: string;
    summary: string;
    scope: string;
    effect: {
        bonus_qty?: number;
        discount_percent?: number;
        discount_amount?: number;
        trade_price?: number;
    };
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productId: number | null;
    customerId: number | null;
    qty: number;
    price: number;
    appliedRuleId: number | null;
    onApply: (rule: RuleHit | null) => void; // null = clear rule
}

function effectLabel(effect: RuleHit['effect']): string {
    const parts: string[] = [];
    if (effect.bonus_qty !== undefined) parts.push(`+${effect.bonus_qty} bonus`);
    if (effect.discount_percent !== undefined) parts.push(`${effect.discount_percent}% off`);
    if (effect.discount_amount !== undefined) parts.push(`Rs ${effect.discount_amount} off`);
    if (effect.trade_price !== undefined) parts.push(`price → Rs ${effect.trade_price}`);
    return parts.join(' · ') || 'no effect at this qty';
}

export function RulePickerDialog({ open, onOpenChange, productId, customerId, qty, price, appliedRuleId, onApply }: Props) {
    const [rules, setRules] = useState<RuleHit[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !productId) return;
        const controller = new AbortController();
        (async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    product_id: String(productId),
                    qty: String(qty || 0),
                    price: String(price || 0),
                });
                if (customerId) params.set('customer_id', String(customerId));
                const response = await fetch(`/lookup/rules?${params}`, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (response.ok) setRules(await response.json());
            } catch {
                /* aborted */
            } finally {
                setLoading(false);
            }
        })();
        return () => controller.abort();
    }, [open, productId, customerId, qty, price]);

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder="Applicable incentive rules…" />
            <CommandList>
                <CommandEmpty>
                    {!productId ? 'Pick a product first.' : loading ? 'Loading…' : 'No rules apply to this line.'}
                </CommandEmpty>
                {appliedRuleId && (
                    <CommandItem
                        value="__clear__"
                        onSelect={() => {
                            onApply(null);
                            onOpenChange(false);
                        }}
                    >
                        <span className="text-destructive">✕ Clear applied rule</span>
                    </CommandItem>
                )}
                {rules.map((rule) => (
                    <CommandItem
                        key={rule.id}
                        value={`${rule.name} ${rule.id}`}
                        onSelect={() => {
                            onApply(rule);
                            onOpenChange(false);
                        }}
                        className="flex items-center justify-between gap-3"
                    >
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="truncate font-medium">{rule.name}</span>
                                {rule.id === appliedRuleId && <Badge variant="outline">applied</Badge>}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                                {rule.summary} · {rule.scope}
                            </div>
                        </div>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{effectLabel(rule.effect)}</span>
                    </CommandItem>
                ))}
            </CommandList>
        </CommandDialog>
    );
}
