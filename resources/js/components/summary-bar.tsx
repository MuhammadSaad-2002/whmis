import { money } from '@/lib/format';

export interface SummaryItem {
    label: string;
    value: number;
    /** Optional sub-line under the value (e.g. a count). */
    hint?: string;
    tone?: 'default' | 'positive' | 'negative';
}

const toneClass: Record<NonNullable<SummaryItem['tone']>, string> = {
    default: 'text-foreground',
    positive: 'text-emerald-600',
    negative: 'text-red-600',
};

/** A responsive row of bordered stat tiles summarising the filtered list below. */
export function SummaryBar({ items }: { items: SummaryItem[] }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((item) => (
                <div key={item.label} className="rounded-xl border p-4">
                    <div className="text-xs text-muted-foreground">{item.label}</div>
                    <div className={`text-2xl font-bold tabular-nums ${toneClass[item.tone ?? 'default']}`}>
                        {money(item.value)}
                    </div>
                    {item.hint && <div className="text-xs text-muted-foreground">{item.hint}</div>}
                </div>
            ))}
        </div>
    );
}
