import { chartTick, shortBalanceLabel } from '@/lib/chart-theme';
import { money } from '@/lib/format';
import { memo, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
    Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

export const colors = {
    sales: '#1f4e79',
    profit: '#14b8a6',
    purchases: '#e3a008',
    purchasesBar: '#f3c75a',
    cogs: '#7c93ab',
    accumulated: '#0f8f80',
    margin: '#94a3b8',
    danger: '#dc2626',
    grid: '#eef1f4',
};

export type Datum = { label: string; value: number };
export type Slice = Datum & { color: string };
export type ActivityPoint = {
    label: string;
    sales: number;
    profit: number;
    received: number;
    cogs: number;
    purchases: number;
    invoice_count: number;
};

export function compact(value: number): string {
    const magnitude = Math.abs(value);
    const [divisor, suffix] = magnitude >= 1e9 ? [1e9, 'B'] as const : magnitude >= 1e6 ? [1e6, 'M'] as const : magnitude >= 1e3 ? [1e3, 'K'] as const : [1, ''] as const;
    return `${Number((value / divisor).toFixed(magnitude < divisor * 10 && suffix ? 1 : 0))}${suffix}`;
}

const tooltip = {
    contentStyle: { background: '#0d2436', border: 'none', borderRadius: 8, color: '#fff', padding: '9px 11px', fontSize: 14 },
    itemStyle: { color: '#f8fafc' },
    labelStyle: { color: '#fff', fontWeight: 600 },
};
const pretty = (value: number) => money(value);
const still = { isAnimationActive: false } as const;
const transition = { isAnimationActive: 'auto', animationBegin: 0, animationDuration: 340, animationEasing: 'ease-out' } as const;
const printMedia = () => window.matchMedia('print').matches;
function subscribeToPrint(update: () => void) {
    const media = window.matchMedia('print');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
}

// Draw the first data immediately; only subsequent data changes animate.
function useChartMotion(data: unknown) {
    const first = useRef(data);
    const printing = useSyncExternalStore(subscribeToPrint, printMedia, () => false);
    return !printing && first.current !== data ? transition : still;
}

export function Spark({ values, color }: { values: number[]; color: string }) {
    const id = useId();
    const min = Math.min(0, ...values);
    const max = Math.max(1, ...values);
    const path = values.map((value, index) =>
        `${index ? 'L' : 'M'}${(index / Math.max(values.length - 1, 1)) * 200} ${31 - (value - min) / (max - min) * 28}`
    ).join(' ');
    const line = values.length === 1 ? `${path} H200` : path;
    const first = useRef(line);
    return (
        <svg className="exec-spark" viewBox="0 0 200 34" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity=".22" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <g key={line} className={line !== first.current ? 'exec-spark-update' : undefined}>
                {values.length > 0 && <path d={`${line} L200 34 L0 34Z`} fill={`url(#${id})`} />}
                <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            </g>
        </svg>
    );
}

const trendSeries = [
    { key: 'sales', label: 'Sales', color: colors.sales, line: false },
    { key: 'purchases', label: 'Purchases', color: colors.purchases, line: false },
    { key: 'profit', label: 'Profit', color: colors.profit, line: true },
    { key: 'margin', label: 'Margin %', color: colors.margin, line: true },
] as const;
const stockSeries = [
    trendSeries[1],
    { key: 'cogs', label: 'COGS', color: colors.cogs, line: false },
    { key: 'accumulated', label: 'Cumulative net stock added', color: colors.accumulated, line: true },
] as const;

export const ActivityChart = memo(function ActivityChart({ data, stock, title, subtitle }: { data: ActivityPoint[]; stock?: boolean; title: string; subtitle: string }) {
    const [hidden, setHidden] = useState<string[]>([]);
    const series = stock ? stockSeries : trendSeries;
    const motion = useChartMotion(data);
    const points = useMemo(() => {
        let accumulated = 0;
        return data.map((point) => {
            accumulated += point.purchases - point.cogs;
            return {
                ...point,
                label: point.label.replace(/ (20)(\d{2})$/, ' $2'),
                margin: point.sales > 0 ? Number((point.profit / point.sales * 100).toFixed(1)) : null,
                accumulated: Number(accumulated.toFixed(2)),
            };
        });
    }, [data]);
    return (
        <>
            <header className="exec-card-head">
                <h2>{title}</h2><span className="exec-tag">{subtitle}</span><span className="exec-spacer" />
                <div className="exec-legend" role="group" aria-label={`${title} chart series`}>
                    {series.map(({ key, label, color, line }) => (
                        <button key={key} type="button" aria-pressed={!hidden.includes(key)} title={key === 'accumulated' ? 'Running net purchases less net COGS, not a physical stock balance' : undefined}
                            onClick={() => setHidden((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])}>
                            <i className={line ? 'line' : ''} style={{ background: color }} aria-hidden="true" />{label}
                        </button>
                    ))}
                </div>
            </header>
            <div className="exec-chart" style={{ height: stock ? 240 : 300 }}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <ComposedChart data={points} title={title} margin={{ top: 9, right: 22, bottom: 1, left: 0 }}>
                        <CartesianGrid vertical={false} stroke={colors.grid} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={chartTick} minTickGap={20} tickMargin={8} height={36} interval="preserveStartEnd" />
                        <YAxis axisLine={false} tickLine={false} tick={chartTick} tickFormatter={compact} width={56} yAxisId="money" />
                        {!stock && <YAxis axisLine={false} tickLine={false} tick={chartTick} tickFormatter={(value) => `${value}%`} width={57} yAxisId="margin" orientation="right"
                            domain={[(min: number) => Math.min(0, min), (max: number) => Math.max(100, max)]} />}
                        <Tooltip {...tooltip} formatter={(value, name) => name === 'Margin %' ? `${value}%` : pretty(Number(value))} />
                        <ReferenceLine y={0} yAxisId="money" stroke={colors.grid} />
                        {!stock && <Bar dataKey="sales" name="Sales" yAxisId="money" hide={hidden.includes('sales')} fill={colors.sales} maxBarSize={26} radius={5} {...motion} />}
                        <Bar dataKey="purchases" name="Purchases" yAxisId="money" hide={hidden.includes('purchases')} fill={colors.purchasesBar} maxBarSize={stock ? 20 : 26} radius={5} {...motion} />
                        {stock ? <>
                            <Bar dataKey="cogs" name="COGS" yAxisId="money" hide={hidden.includes('cogs')} fill={colors.cogs} maxBarSize={20} radius={4} {...motion} />
                            <Line dataKey="accumulated" name="Cumulative net stock added" yAxisId="money" hide={hidden.includes('accumulated')} type="monotone" stroke={colors.accumulated} strokeWidth={2} dot={{ r: 2.5 }} {...motion} />
                        </> : <>
                            <Area dataKey="profit" name="Profit" yAxisId="money" hide={hidden.includes('profit')} type="monotone" stroke={colors.profit} fill={colors.profit} fillOpacity={.12} strokeWidth={2.2} dot={{ r: 3, fill: '#fff' }} {...motion} baseValue={0} />
                            <Line dataKey="margin" name="Margin %" yAxisId="margin" hide={hidden.includes('margin')} type="monotone" stroke={colors.margin} strokeWidth={1.6} strokeDasharray="4 4" dot={{ r: 2.5 }} connectNulls {...motion} />
                        </>}
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </>
    );
});

export const RankingChart = memo(function RankingChart({ data, title, height, color, showLabels = true, percentage = false }: {
    data: Datum[]; title: string; height: number; color: (index: number) => string; showLabels?: boolean; percentage?: boolean;
}) {
    const motion = useChartMotion(data);
    if (!data.length) return <div className="exec-empty" style={{ minHeight: height }}>No sales in this period.</div>;
    return (
        <div className="exec-chart" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={data} title={title} layout="vertical" margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} stroke={colors.grid} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={chartTick} tickCount={5} minTickGap={12} height={32}
                        domain={[(min: number) => Math.min(0, min), 'auto']} tickFormatter={percentage ? (value) => `${value}%` : compact} />
                    <YAxis dataKey="label" type="category" hide={!showLabels} width={154} axisLine={false} tickLine={false}
                        tick={chartTick} interval={0}
                        tickFormatter={(name: string) => name.length > 17 ? `${name.slice(0, 16)}…` : name} />
                    <Tooltip {...tooltip} formatter={(value) => percentage ? `${Number(value).toFixed(1)}% of sales` : pretty(Number(value))} />
                    <ReferenceLine x={0} stroke={colors.grid} />
                    <Bar dataKey="value" name={percentage ? 'Share' : 'Revenue'} barSize={showLabels ? 16 : 18} radius={4} {...motion}>
                        {data.map((row, index) => <Cell key={`${row.label}-${index}`} fill={color(index)} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
});

export const Donut = memo(function Donut({ slices, label, value, centered }: { slices: Slice[]; label: string; value: string; centered?: boolean }) {
    const nonzero = useMemo(() => slices.filter((slice) => slice.value > 0), [slices]);
    const motion = useChartMotion(slices);
    return (
        <div className={`exec-donut ${centered ? 'centered' : ''}`}>
            {nonzero.length ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart title={label}>
                        <Pie data={nonzero} nameKey="label" dataKey="value" cx="50%" cy="50%" outerRadius="94%" innerRadius="68%"
                            stroke="#fff" strokeWidth={2} paddingAngle={nonzero.length > 1 ? .5 : 0} startAngle={90} endAngle={-270} {...motion}>
                            {nonzero.map((slice) => <Cell key={slice.label} fill={slice.color} />)}
                        </Pie>
                        <Tooltip {...tooltip} formatter={(amount) => pretty(Number(amount))} />
                    </PieChart>
                </ResponsiveContainer>
            ) : <div aria-hidden="true" className="exec-donut-empty" />}
            <div className="exec-donut-center"><div><small>{label}</small><b className="exec-num">{value}</b></div></div>
        </div>
    );
});

export const Waterfall = memo(function Waterfall({ entries, total }: { entries: Slice[]; total: number }) {
    const motion = useChartMotion(entries);
    const [narrow, setNarrow] = useState(false);
    let cumulative = 0;
    const steps = entries.map((entry) => {
        const start = cumulative;
        cumulative += entry.value;
        return { ...entry, range: [Math.min(start, cumulative), Math.max(start, cumulative)] };
    });
    steps.push({ label: 'Net position', value: total, color: total < 0 ? colors.danger : colors.profit, range: [Math.min(total, 0), Math.max(total, 0)] });
    return (
        <div className="exec-chart" style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} onResize={(width) => setNarrow(width < 530)}>
                <BarChart data={steps} title="Working capital waterfall" margin={{ top: 6, right: 12, bottom: 1, left: 0 }}>
                    <CartesianGrid vertical={false} stroke={colors.grid} />
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={chartTick} minTickGap={narrow ? 3 : 10} height={34} interval="preserveStartEnd"
                        tickFormatter={narrow ? shortBalanceLabel : undefined} />
                    <YAxis axisLine={false} tickLine={false} tick={chartTick} tickFormatter={compact} width={56} tickCount={5} />
                    <Tooltip {...tooltip} formatter={(_range, _name, item) => pretty(Number(item.payload?.value ?? 0))} />
                    <ReferenceLine y={0} stroke={colors.grid} />
                    <Bar dataKey="range" name="Amount" maxBarSize={38} radius={4} minPointSize={2} {...motion}>
                        {steps.map((entry) => <Cell key={entry.label} fill={entry.color} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
});
