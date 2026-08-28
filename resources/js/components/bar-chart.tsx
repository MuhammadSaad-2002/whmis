import { amount } from '@/lib/format';
import { useEffect, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface BarDatum {
    label: string;
    value: number;
}

// Single-series magnitude ranking → categorical slot 1 (blue), entity-stable.
const COLORS = {
    light: { bar: '#2a78d6', text: '#00000099', grid: '#00000014' },
    dark: { bar: '#3987e5', text: '#ffffff99', grid: '#ffffff1a' },
};

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

/** Horizontal bars, ranked highest-first, with a truncated category axis. */
export function HBarChart({ data }: { data: BarDatum[] }) {
    const palette = useIsDark() ? COLORS.dark : COLORS.light;

    if (data.length === 0) {
        return <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">No data for this period.</div>;
    }

    return (
        <div style={{ height: Math.max(140, data.length * 40) }} className="w-full">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
                    <XAxis type="number" hide />
                    <YAxis
                        type="category"
                        dataKey="label"
                        width={140}
                        tick={{ fill: palette.text, fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + '…' : v)}
                    />
                    <Tooltip
                        cursor={{ fill: palette.grid }}
                        formatter={(value) => [`Rs ${amount(Number(value ?? 0))}`, 'Net Revenue']}
                        contentStyle={{
                            borderRadius: 8,
                            border: '1px solid ' + palette.grid,
                            background: 'var(--background, #fff)',
                            color: 'inherit',
                            fontSize: 12,
                        }}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={20}>
                        {data.map((_, index) => (
                            <Cell key={index} fill={palette.bar} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
