import { chartTheme } from '@/lib/chart-theme';
import { amount } from '@/lib/format';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface DonutSlice {
    label: string;
    value: number;
}

export function DonutChart({ data }: { data: DonutSlice[] }) {
    // A progressively deeper color indicates older receivables.
    const ramp = chartTheme.aging;

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
                            stroke={chartTheme.surface}
                            strokeWidth={2}
                            isAnimationActive={false}
                        >
                            {(empty ? [0] : data).map((_, index) => (
                                <Cell key={index} fill={empty ? chartTheme.grid : ramp[index % ramp.length]} />
                            ))}
                        </Pie>
                        {!empty && (
                            <Tooltip
                                formatter={(value, name) => [`Rs ${amount(Number(value ?? 0))}`, String(name ?? '')]}
                                contentStyle={chartTheme.tooltip}
                                itemStyle={{ color: 'var(--popover-foreground)' }}
                            />
                        )}
                    </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-medium text-muted-foreground">Total</span>
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
