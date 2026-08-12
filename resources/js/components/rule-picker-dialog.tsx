import { Badge } from '@/components/ui/badge';
import {
    CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import type { IncentiveHit } from '@/lib/incentive';
import { useEffect, useState } from 'react';

/** A rule as returned by /lookup/rules — an IncentiveHit plus display fields. */
export interface RuleHit extends IncentiveHit {
    summary: string;
    scope: string;
}

const TYPE_LABELS: Record<string, string> = {
    qty_bonus: 'quantity bonus',
    slab_bonus: 'slab bonus',
    percent_discount: 'percent discount',
    fixed_discount: 'fixed discount',
    price_override: 'price override',
};

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    productId: number | null;
    customerId: number | null;
    qty: number;
    price: number;
    applied: RuleHit[]; // rules already stacked on this line
    onAdd: (rule: RuleHit) => void;
    onRemove: (rule: RuleHit) => void;
}

function effectLabel(effect: RuleHit['effect']): string {
    const parts: string[] = [];
    if (effect.bonus_qty !== undefined) parts.push(`+${effect.bonus_qty} bonus`);
    if (effect.discount_percent !== undefined) parts.push(`${effect.discount_percent}% off`);
    if (effect.discount_amount !== undefined) parts.push(`Rs ${effect.discount_amount} off`);
    if (effect.trade_price !== undefined) parts.push(`price → Rs ${effect.trade_price}`);
    return parts.join(' · ') || 'no effect at this qty';
}

export function RulePickerDialog({ open, onOpenChange, productId, customerId, qty, price, applied, onAdd, onRemove }: Props) {
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

    // Stack stays open while toggling so several incentives can be combined; a
    // line may hold at most one rule per type, so a type already taken by a
    // different rule is blocked.
    const appliedIds = new Set(applied.map((a) => a.id));
    const takenTypes = new Set(applied.map((a) => a.rule_type));

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder="Stack incentive rules — Esc when done…" />
            <CommandList>
                <CommandEmpty>
                    {!productId ? 'Pick a product first.' : loading ? 'Loading…' : 'No rules apply to this line.'}
                </CommandEmpty>
                {rules.map((rule) => {
                    const isApplied = appliedIds.has(rule.id);
                    const blocked = !isApplied && takenTypes.has(rule.rule_type);
                    return (
                        <CommandItem
                            key={rule.id}
                            value={`${rule.name} ${rule.id}`}
                            disabled={blocked}
                            onSelect={() => {
                                if (isApplied) onRemove(rule);
                                else if (!blocked) onAdd(rule);
                            }}
                            className="flex items-center justify-between gap-3 data-[disabled=true]:opacity-40"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="truncate font-medium">{rule.name}</span>
                                    {isApplied && <Badge variant="default">applied · ✕ remove</Badge>}
                                    {blocked && (
                                        <Badge variant="outline">{TYPE_LABELS[rule.rule_type] ?? rule.rule_type} taken</Badge>
                                    )}
                                </div>
                                <div className="truncate text-xs text-muted-foreground">
                                    {rule.summary} · {rule.scope}
                                </div>
                            </div>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{effectLabel(rule.effect)}</span>
                        </CommandItem>
                    );
                })}
            </CommandList>
        </CommandDialog>
    );
}
