const rsFormatter = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const qtyFormatter = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

export function money(value: number | string | null | undefined): string {
    const n = Number(value ?? 0);
    return `Rs ${rsFormatter.format(Number.isFinite(n) ? n : 0)}`;
}

export function amount(value: number | string | null | undefined): string {
    const n = Number(value ?? 0);
    return rsFormatter.format(Number.isFinite(n) ? n : 0);
}

export function qty(value: number | string | null | undefined): string {
    const n = Number(value ?? 0);
    return qtyFormatter.format(Number.isFinite(n) ? n : 0);
}

export function pct(value: number | string | null | undefined): string {
    const n = Number(value ?? 0);
    return `${qtyFormatter.format(Number.isFinite(n) ? n : 0)}%`;
}

export function shortDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function toNumber(value: string | number | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Two-decimal string for price/percent input fields ('' stays '').
 * Used to normalize values on blur and when auto-filling from lookups.
 */
export function dec2(value: string | number | null | undefined): string {
    if (value === '' || value === null || value === undefined) return '';
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(2) : '';
}
