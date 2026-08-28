import { amount } from '@/lib/format';
import { useEffect, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface DonutSlice {
    label: string;
    value: number;
}

// Ordinal blue ramp (dataviz skill, sequential steps, validated with --ordinal):
// light→dark reads "more aged = deeper". Buckets are ordered 0–30 … 90+.
const RAMP = {
    light: ['#86b6ef', '#5598e7', '#2a78d6', '#184f95'],
    dark: ['#9ec5f4', '#6da7ec', '#3987e5', '#256abf'],
};
const TEXT = { light: '#00000099', dark: '#ffffff99' };
const SURFACE_GAP = { light: '#fcfcfb', dark: '#1a1a19' };

function useIsDark(): boolean {
    const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

    useEffect(() => {
        const observer = new MutationObserver(() =>
            setDark(document.documentElement.classList.contains('dark')),
        );
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return dark;
}

export function DonutChart({ data }: { data: DonutSlice[] }) {
    const isDark = useIsDark();
    const ramp = isDark ? RAMP.dark : RAMP.light;
    const text = isDark ? TEXT.dark : TEXT.light;
    const gap = isDark ? SURFACE_GAP.dark : SURFACE_GAP.light;

    const total = data.reduce((sum, slice) => sum + slice.value, 0);
    const empty = total <= 0;

    return (
        <div className="flex items-center gap-6">
            <div className="relative h-48 w-48 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={empty ? [{ label: 'None', value: 1 }] : data}
                            dataKey="value"
                            nameKey="label"
                            innerRadius="62%"
                            outerRadius="100%"
                            paddingAngle={empty ? 0 : 2}
                            stroke={gap}
                            strokeWidth={2}
                            isAnimationActive={false}
                        >
                            {(empty ? [0] : data).map((_, index) => (
                                <Cell key={index} fill={empty ? '#8884' : ramp[index % ramp.length]} />
                            ))}
                        </Pie>
                        {!empty && (
                            <Tooltip
                                formatter={(value, name) => [`Rs ${amount(Number(value ?? 0))}`, String(name ?? '')]}
                                contentStyle={{
                                    borderRadius: 8,
                                    border: '1px solid ' + text,
                                    background: 'var(--background, #fff)',
                                    color: 'inherit',
                                    fontSize: 12,
                                }}
                            />
                        )}
                    </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs text-muted-foreground">Total</span>
                    <span className="text-lg font-semibold tabular-nums">Rs {amount(total)}</span>
                </div>
            </div>

            <ul className="flex-1 space-y-2 text-sm">
                {data.map((slice, index) => (
                    <li key={slice.label} className="flex items-center gap-2">
                        <span
                            className="size-3 shrink-0 rounded-sm"
                            style={{ background: ramp[index % ramp.length] }}
                            aria-hidden
                        />
                        <span className="text-muted-foreground">{slice.label} days</span>
                        <span className="ml-auto font-medium tabular-nums">Rs {amount(slice.value)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
