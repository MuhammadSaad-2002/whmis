import { amount } from '@/lib/format';
import { useEffect, useState } from 'react';
import {
    CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export interface TrendPoint {
    label: string;
    sales: number;
    profit: number;
}

// Validated categorical palette (dataviz skill reference): slot 1 blue, slot 2 aqua.
// Colors are entity-stable: Sales is always blue, Profit always aqua.
const COLORS = {
    light: { sales: '#2a78d6', profit: '#1baf7a', grid: '#00000014', text: '#00000099' },
    dark: { sales: '#3987e5', profit: '#199e70', grid: '#ffffff1a', text: '#ffffff99' },
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

export function TrendChart({ data }: { data: TrendPoint[] }) {
    const palette = useIsDark() ? COLORS.dark : COLORS.light;

    return (
        <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke={palette.grid} vertical={false} />
                    <XAxis
                        dataKey="label"
                        tick={{ fill: palette.text, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: palette.grid }}
                    />
                    <YAxis
                        tick={{ fill: palette.text, fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) =>
                            value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M`
                                : value >= 1_000 ? `${(value / 1_000).toFixed(0)}K`
                                : String(value)
                        }
                        width={48}
                    />
                    <Tooltip
                        formatter={(value, name) => [`Rs ${amount(Number(value ?? 0))}`, String(name ?? '')]}
                        contentStyle={{
                            borderRadius: 8,
                            border: '1px solid ' + palette.grid,
                            background: 'var(--background, #fff)',
                            color: 'inherit',
                            fontSize: 12,
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                        type="monotone" dataKey="sales" name="Sales"
                        stroke={palette.sales} strokeWidth={2}
                        dot={false} activeDot={{ r: 4 }}
                    />
                    <Line
                        type="monotone" dataKey="profit" name="Profit"
                        stroke={palette.profit} strokeWidth={2}
                        dot={false} activeDot={{ r: 4 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
