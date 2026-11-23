import { chartTheme } from '@/lib/chart-theme';
import { amount } from '@/lib/format';
import {
    CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export interface TrendPoint {
    label: string;
    sales: number;
    profit: number;
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
    return (
        <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                        dataKey="label"
                        tick={{ fill: chartTheme.text, fontSize: 11 }}
                        tickLine={false}
                        axisLine={{ stroke: chartTheme.grid }}
                    />
                    <YAxis
                        tick={{ fill: chartTheme.text, fontSize: 11 }}
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
                        contentStyle={chartTheme.tooltip}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                        type="monotone" dataKey="sales" name="Sales"
                        stroke={chartTheme.sales} strokeWidth={2}
                        dot={false} activeDot={{ r: 4 }}
                    />
                    <Line
                        type="monotone" dataKey="profit" name="Profit"
                        stroke={chartTheme.profit} strokeWidth={2} strokeDasharray="5 3"
                        dot={false} activeDot={{ r: 4 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
