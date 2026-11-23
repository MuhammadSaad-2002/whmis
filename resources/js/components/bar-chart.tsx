import { chartTheme } from '@/lib/chart-theme';
import { amount, qty } from '@/lib/format';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface BarDatum {
    label: string;
    value: number;
}

interface HBarChartProps {
    data: BarDatum[];
    valueLabel?: string;
    valueFormat?: 'money' | 'qty' | 'pct';
}

function formatValue(value: number, format: HBarChartProps['valueFormat']): string {
    if (format === 'qty') return qty(value);
    if (format === 'pct') return `${amount(value)}%`;
    return `Rs ${amount(value)}`;
}

/** Horizontal bars, ranked highest-first, with a truncated category axis. */
export function HBarChart({ data, valueLabel = 'Net Revenue', valueFormat = 'money' }: HBarChartProps) {
    if (data.length === 0) {
        return <div className="text-muted-foreground flex h-72 items-center justify-center text-sm">No data for this period.</div>;
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
                        tick={{ fill: chartTheme.text, fontSize: 12 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: string) => (v.length > 20 ? v.slice(0, 19) + '…' : v)}
                    />
                    <Tooltip
                        cursor={{ fill: 'var(--muted)' }}
                        formatter={(value) => {
                            const numericValue = Number(value ?? 0);
                            return [
                                formatValue(numericValue, valueFormat),
                                numericValue < 0
                                    ? `${valueLabel} - negative because deductions, returns, costs, or outbound quantities exceed the corresponding positive amount`
                                    : valueLabel,
                            ];
                        }}
                        contentStyle={chartTheme.tooltip}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} isAnimationActive={false} barSize={20}>
                        {data.map((datum, index) => (
                            <Cell key={index} fill={datum.value < 0 ? chartTheme.negative : chartTheme.sales} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
