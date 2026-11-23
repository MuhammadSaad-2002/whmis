// CSS variables keep Recharts in sync with the app theme without remounting the charts.
export const chartTheme = {
    sales: 'var(--chart-1)',
    profit: 'var(--chart-2)',
    negative: 'var(--destructive)',
    grid: 'var(--border)',
    text: 'var(--chart-label, var(--foreground))',
    surface: 'var(--card)',
    aging: ['var(--chart-aging-1)', 'var(--chart-aging-2)', 'var(--chart-aging-3)', 'var(--chart-aging-4)'],
    tooltip: {
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--popover)',
        color: 'var(--popover-foreground)',
        fontSize: 14,
    },
};

export const chartTick = { fill: chartTheme.text, fontSize: 13, fontWeight: 600 };

const shortBalanceLabels: Record<string, string> = {
    Receivables: 'Due in',
    Payables: 'Due out',
    'Staff advances': 'Adv.',
    'Salary payable': 'Salary',
    'Net position': 'Net',
};

export const shortBalanceLabel = (label: string) => shortBalanceLabels[label] ?? label;
