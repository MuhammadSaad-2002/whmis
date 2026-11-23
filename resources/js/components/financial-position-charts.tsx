import { chartTick, shortBalanceLabel } from '@/lib/chart-theme';
import { money } from '@/lib/format';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export const bucketLabels = ['Current', '31–60', '61–90', '90+'];
export const bucketColors = ['#99e0d6', '#14b8a6', '#f59e0b', '#dc2626'];
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const compactNumber = (value: number) => compact.format(value);
export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
export const share = (value: number, total: number) => total > 0 ? value / total * 100 : 0;
const tip = { borderRadius: 9, color: 'white', background: '#0d2436', border: 0, fontSize: 14 };
const tipValues = { color: 'white' };

function animated() {
    return typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PositionBridge({ receivable, payable, advances, salary, net }: { receivable: number; payable: number; advances: number; salary: number; net: number }) {
    const [narrow, setNarrow] = useState(false);
    const trade = receivable - payable;
    const afterAdvances = trade + advances;
    const rows = [
        { name: 'Receivables', range: [0, receivable], amount: receivable, color: '#14b8a6' },
        { name: 'Payables', range: [receivable, trade], amount: -payable, color: '#e76f6f' },
        { name: 'Staff advances', range: [trade, afterAdvances], amount: advances, color: '#cbd5e1' },
        { name: 'Salary payable', range: [afterAdvances, net], amount: -salary, color: '#cbd5e1' },
        { name: 'Net position', range: [0, net], amount: net, color: net < 0 ? '#dc2626' : '#059669' },
    ];
    return <div className="chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} onResize={(width) => setNarrow(width < 530)}>
            <BarChart data={rows} margin={{ top: 5, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#eef1f4" vertical={false} />
                <XAxis dataKey="name" tick={chartTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={narrow ? 3 : 10} height={38}
                    tickFormatter={narrow ? shortBalanceLabel : undefined} />
                <YAxis tick={chartTick} tickLine={false} axisLine={false} width={56} tickFormatter={compactNumber} />
                <ReferenceLine y={0} stroke="#cbd5e1" />
                <Tooltip contentStyle={tip} itemStyle={tipValues} cursor={{ fill: '#f3f5f7' }}
                    formatter={(_, __, entry) => [money(entry.payload.amount), 'Change']} />
                <Bar dataKey="range" radius={5} maxBarSize={52} minPointSize={2} isAnimationActive={animated()} animationDuration={400}>
                    {rows.map((row) => <Cell key={row.name} fill={row.color} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    </div>;
}

export function AgingBars({ first, second, planner = false }: { first: number[]; second: number[]; planner?: boolean }) {
    const rows = bucketLabels.map((name, i) => ({ name, first: first[i], second: second[i] }));
    return <div className={planner ? 'chart planner-chart' : 'chart'}>
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <BarChart data={rows} margin={{ top: 5, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#eef1f4" vertical={false} />
                <XAxis dataKey="name" tick={chartTick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} height={34} />
                <YAxis tick={chartTick} tickLine={false} axisLine={false} width={56} tickFormatter={compactNumber} />
                <Tooltip contentStyle={tip} itemStyle={tipValues} cursor={{ fill: '#f3f5f7' }} formatter={(value) => money(Number(value))} />
                <Bar dataKey="first" name={planner ? 'Today' : 'Receivable'} radius={[4, 4, 0, 0]} maxBarSize={26}
                    fill={planner ? '#e5e9ee' : '#14b8a6'} isAnimationActive={animated()} animationDuration={400} />
                <Bar dataKey="second" name={planner ? 'After payment' : 'Payable'} radius={[4, 4, 0, 0]} maxBarSize={26}
                    fill="#e76f6f" isAnimationActive={animated()} animationDuration={400}>
                    {planner && rows.map((row, i) => <Cell key={row.name} fill={bucketColors[i]} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    </div>;
}

export function AgingDonut({ values, balance, label }: { values: number[]; balance: number; label: string }) {
    const total = sum(values);
    const rows = total ? bucketLabels.map((name, i) => ({ name, value: values[i], color: bucketColors[i] })) : [{ name: 'No balance', value: 1, color: '#e5e9ee' }];
    return <div className="donut">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
            <PieChart>
                <Pie data={rows} dataKey="value" nameKey="name" innerRadius={48} outerRadius={71} stroke="#fff" strokeWidth={2}
                    startAngle={90} endAngle={-270} isAnimationActive={animated()} animationDuration={400}>
                    {rows.map((row) => <Cell key={row.name} fill={row.color} />)}
                </Pie>
                {total > 0 && <Tooltip contentStyle={tip} itemStyle={tipValues} formatter={(value) => money(Number(value))} />}
            </PieChart>
        </ResponsiveContainer>
        <div className="c"><div><small>{label}</small><b className="num" title={money(balance)}>Rs {compactNumber(balance)}</b></div></div>
    </div>;
}
