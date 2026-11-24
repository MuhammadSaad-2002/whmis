import { chartTheme, chartTick } from '@/lib/chart-theme';
import { amount } from '@/lib/format';
import {
    CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export interface TrendPoint {
    label: string;
    sales: number;
    profit: number;
    received?: number;
}

const compactNumber = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function TrendChart({ data }: { data: TrendPoint[] }) {
    const hasReceipts = data.some((point) => point.received !== undefined);
    return (
        <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
                    <CartesianGrid stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                        dataKey="label"
                        tick={chartTick}
                        tickMargin={8}
                        minTickGap={16}
                        interval="preserveStartEnd"
                        height={36}
                        tickLine={false}
                        axisLine={{ stroke: chartTheme.grid }}
                    />
                    <YAxis
                        tick={chartTick}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value: number) => compactNumber.format(value)}
                        width={57}
                    />
                    <Tooltip
                        formatter={(value, name) => [`Rs ${amount(Number(value ?? 0))}`, String(name ?? '')]}
                        contentStyle={chartTheme.tooltip}
                    />
                    <Legend wrapperStyle={{ fontSize: 14, fontWeight: 600 }} formatter={(label) => <span style={{ color: chartTheme.text }}>{label}</span>} />
                    <Line
                        type="monotone" dataKey="sales" name="Net Sales"
                        stroke={chartTheme.sales} strokeWidth={2}
                        dot={false} activeDot={{ r: 4 }}
                    />
                    <Line
                        type="monotone" dataKey="profit" name="Net Profit"
                        stroke={chartTheme.profit} strokeWidth={2} strokeDasharray="5 3"
                        dot={false} activeDot={{ r: 4 }}
                    />
                    {hasReceipts && <Line type="monotone" dataKey="received" name="Actual Receipts" stroke="#684ab4" strokeWidth={2}
                        strokeDasharray="2 4" dot={false} activeDot={{ r: 4 }} />}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
