import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    date?: string | null;
    applied?: RuleHit[]; // rules already stacked on this line (single-rule callers omit)
    bonusLocked?: boolean;
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

export function RulePickerDialog({ open, onOpenChange, productId, customerId, qty, price, date, applied = [], bonusLocked = false, onAdd, onRemove }: Props) {
    const context = open && productId ? new URLSearchParams({
        product_id: String(productId), qty: String(qty || 0), price: String(price || 0),
        ...(customerId ? { customer_id: String(customerId) } : {}), ...(date ? { date } : {}),
    }).toString() : null;
    const [result, setResult] = useState<{ context: string; rules: RuleHit[]; failed?: boolean } | null>(null);
    const loading = context !== null && result?.context !== context;
    const rules = context && result?.context === context ? result.rules : [];
    const failed = context !== null && result?.context === context && result.failed;

    useEffect(() => {
        if (!context) {
            setResult(null);
            return;
        }
        const controller = new AbortController();
        (async () => {
            try {
                const response = await fetch(`/lookup/rules?${context}`, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (!response.ok) throw new Error('Incentive rules unavailable');
                const rules: RuleHit[] = await response.json();
                if (!controller.signal.aborted) setResult({ context, rules });
            } catch {
                if (!controller.signal.aborted) setResult({ context, rules: [], failed: true });
            }
        })();
        return () => controller.abort();
    }, [context]);

    // Stack stays open while toggling so several incentives can be combined; a
    // line may hold at most one rule per type, so a type already taken by a
    // different rule is blocked.
    const appliedIds = new Set(applied.map((a) => a.id));
    const takenTypes = new Set(applied.map((a) => a.rule_type));
    const lockedCount = rules.filter((rule) => rule.eligible === false).length;

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange} contentClassName="w-[calc(100%-1rem)] max-w-2xl max-h-[85dvh] rounded-lg [&_[cmdk-root]]:min-h-0 [&_[cmdk-root]]:max-h-[85dvh]">
            <CommandInput placeholder="Search incentive rules…" className="pr-8 text-base sm:text-sm" />
            {productId && (
                <div className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground">
                    {loading ? 'Loading rules…' : failed ? 'Rules unavailable' : `${rules.length} matching rule${rules.length === 1 ? '' : 's'}`}
                    {!loading && lockedCount > 0 && ` · ${lockedCount} locked until quantity qualifies`}
                </div>
            )}
            <CommandList className="min-h-0 max-h-[55dvh] flex-1 overscroll-contain">
                <CommandEmpty>
                    {!productId ? 'Pick a product first.' : loading ? 'Loading…' : failed ? 'Could not load rules. Close and reopen to retry.' : 'No rules apply to this line.'}
                </CommandEmpty>
                {rules.map((rule) => {
                    const isApplied = appliedIds.has(rule.id);
                    const lockedBonus = bonusLocked && ['qty_bonus', 'slab_bonus'].includes(rule.rule_type);
                    const locked = lockedBonus || (!isApplied && rule.eligible === false);
                    const lockLabel = lockedBonus ? 'Bonus set by the booking' : (rule.eligibility_label ?? 'increase qty');
                    const blocked = !isApplied && takenTypes.has(rule.rule_type);
                    return (
                        <CommandItem
                            key={rule.id}
                            value={`${rule.name} ${rule.id}`}
                            disabled={blocked || locked}
                            onSelect={() => {
                                if (isApplied) onRemove(rule);
                                else if (!blocked && !locked) onAdd(rule);
                            }}
                            className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3 data-[disabled=true]:opacity-60"
                        >
                            <div className="min-w-0 max-w-full">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="break-words font-medium">{rule.name}</span>
                                    {isApplied && <Badge variant="default">{locked ? 'applied' : 'applied · ✕ remove'}</Badge>}
                                    {blocked && (
                                        <Badge variant="outline">{TYPE_LABELS[rule.rule_type] ?? rule.rule_type} taken</Badge>
                                    )}
                                    {locked && <Badge variant="outline">{lockLabel}</Badge>}
                                </div>
                                <div className="break-words text-xs text-muted-foreground sm:truncate">
                                    {rule.summary} · {rule.scope}
                                </div>
                            </div>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                                {locked ? lockLabel : effectLabel(rule.effect)}
                            </span>
                        </CommandItem>
                    );
                })}
            </CommandList>
            <div className="flex shrink-0 justify-end border-t p-2">
                <Button type="button" size="sm" onClick={() => onOpenChange(false)}>Done</Button>
            </div>
        </CommandDialog>
    );
}
