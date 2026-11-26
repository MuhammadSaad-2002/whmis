import { chartTheme, chartTick } from '@/lib/chart-theme';
import { amount, qty } from '@/lib/format';
import { useState } from 'react';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ReferenceLine,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';

export interface ReportChartView {
    id: string;
    title: string;
    description: string;
    kind: 'donut' | 'column' | 'line' | 'stacked';
    unit: 'money' | 'qty';
    labels: string[];
    points: { label: string; values: number[] }[];
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 });

function valueLabel(value: number, unit: ReportChartView['unit']) {
    return unit === 'money' ? `Rs ${amount(value)}` : qty(value);
}

function Swatch({ color }: { color: string }) {
    return <i className="insight-swatch" style={{ background: color }} aria-hidden="true" />;
}

function ChartValues({ view }: { view: ReportChartView }) {
    return (
        <details className="insight-values">
            <summary>Chart values</summary>
            <div className="insight-values-scroll" tabIndex={0} role="region" aria-label={`${view.title} values`}>
                <table className="insight-values-table">
                    <thead>
                        <tr>
                            <th scope="col">Group</th>
                            {view.labels.map((label) => (
                                <th key={label} className="r" scope="col">
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {view.points.map((point, i) => (
                            <tr key={i}>
                                <td>{point.label}</td>
                                {point.values.map((value, index) => (
                                    <td key={index} className="r num">
                                        {valueLabel(value, view.unit)}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </details>
    );
}

function Donut({ view, colors }: { view: ReportChartView; colors: string[] }) {
    const [highlight, setHighlight] = useState<string | null>(null);
    const points = view.points.map(({ label, values }) => ({ name: label, value: values[0] }));
    const total = points.reduce((sum, point) => sum + point.value, 0);
    const selected = points.find((point) => point.name === highlight);

    return (
        <div className="insight-donut">
            <div className="insight-ring">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart accessibilityLayer>
                        <Pie
                            data={points}
                            dataKey="value"
                            nameKey="name"
                            innerRadius="61%"
                            outerRadius="89%"
                            startAngle={90}
                            endAngle={-270}
                            stroke="none"
                            isAnimationActive={false}
                        >
                            {points.map((point, index) => (
                                <Cell key={point.name} fill={colors[index]} fillOpacity={selected && selected.name !== point.name ? 0.28 : 1} />
                            ))}
                        </Pie>
                        <Tooltip formatter={(value) => [valueLabel(Number(value), view.unit), 'Amount']} contentStyle={chartTheme.tooltip} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="insight-ring-center" aria-hidden="true">
                    <span>{selected ? 'Share' : 'Total shown'}</span>
                    <strong>{selected ? percent.format(selected.value / total) : compact.format(total)}</strong>
                </div>
            </div>
            <ul className="insight-breakdown" aria-label={`${view.title} breakdown`}>
                {points.map(({ name, value }, index) => (
                    <li key={name}>
                        <button type="button" aria-pressed={highlight === name} onClick={() => setHighlight(highlight === name ? null : name)}>
                            <Swatch color={colors[index]} />
                            <span>{name}</span>
                            <strong className="num">{valueLabel(value, view.unit)}</strong>
                            <span className="insight-share num">{percent.format(value / total)}</span>
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function Cartesian({ view, colors }: { view: ReportChartView; colors: string[] }) {
    const line = view.kind === 'line';
    const numbered = view.points.length <= 6 && view.points.some(({ label }) => label.length > 11);
    const data = view.points.map(({ label, values }, index) => ({
        label,
        tick: numbered ? String(index + 1) : label,
        ...Object.fromEntries(values.map((value, i) => [`v${i}`, value])),
    }));
    const axis = (
        <>
            <CartesianGrid stroke={chartTheme.grid} vertical={false} />
            <XAxis dataKey="tick" tick={chartTick} tickLine={false} axisLine={false} minTickGap={14} tickMargin={8} interval="preserveStartEnd" />
            <YAxis tick={chartTick} tickLine={false} axisLine={false} width={55} tickFormatter={(value: number) => compact.format(value)} />
            <ReferenceLine y={0} stroke="#62788b" />
            <Tooltip
                contentStyle={chartTheme.tooltip}
                labelFormatter={(_, items) => items[0]?.payload?.label}
                formatter={(value, name) => [valueLabel(Number(value), view.unit), String(name)]}
            />
        </>
    );
    return (
        <>
            <div className="insight-cartesian" data-sparse={data.length <= 2}>
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    {line ? (
                        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 5, left: 0 }} accessibilityLayer>
                            {axis}
                            {view.labels.map((label, index) => (
                                <Line
                                    key={label}
                                    name={label}
                                    dataKey={`v${index}`}
                                    stroke={colors[index]}
                                    strokeWidth={2.5}
                                    strokeDasharray={index === 1 ? '6 3' : index === 2 ? '2 3' : undefined}
                                    dot={data.length <= 14}
                                    isAnimationActive={false}
                                />
                            ))}
                        </LineChart>
                    ) : (
                        <BarChart
                            data={data}
                            margin={{ top: 12, right: 12, bottom: 5, left: 0 }}
                            barGap={2}
                            barCategoryGap={data.length <= 2 ? '30%' : '17%'}
                            accessibilityLayer
                        >
                            {axis}
                            {view.labels.map((label, index) => (
                                <Bar
                                    key={label}
                                    name={label}
                                    dataKey={`v${index}`}
                                    fill={colors[index]}
                                    maxBarSize={34}
                                    stackId={view.kind === 'stacked' ? 'total' : undefined}
                                    isAnimationActive={false}
                                />
                            ))}
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
            <ul className="insight-legend" aria-label="Chart legend">
                {view.labels.map((label, index) => (
                    <li key={label}>
                        <Swatch color={colors[index]} />
                        {label}
                    </li>
                ))}
            </ul>
            {numbered && (
                <ol className="insight-category-key" aria-label="Category labels">
                    {view.points.map(({ label }, index) => (
                        <li key={index}>
                            <strong>{index + 1}.</strong> {label}
                        </li>
                    ))}
                </ol>
            )}
            <ChartValues view={view} />
        </>
    );
}

export default function ChartView({ view, colors }: { view: ReportChartView; colors: string[] }) {
    return (
        <figure aria-label={view.title}>
            <figcaption className="report-chart-caption">
                {[view.description, view.kind !== 'donut' && view.unit === 'money' ? 'Amounts in PKR.' : ''].filter(Boolean).join(' ')}
            </figcaption>
            {view.kind === 'donut' ? <Donut key={view.id} view={view} colors={colors} /> : <Cartesian view={view} colors={colors} />}
        </figure>
    );
}
