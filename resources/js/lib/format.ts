const rsFormatter = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

const qtyFormatter = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
});

const pakistanDateFormatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

export function pakistanDate(now = new Date()): string {
    return pakistanDateFormatter.format(now);
}

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
    const calendarOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: calendarOnly ? 'UTC' : undefined });
}

export function shiftDate(date: string, days: number): string {
    const day = new Date(date + 'T00:00:00Z');
    day.setUTCDate(day.getUTCDate() + days);
    return day.toISOString().slice(0, 10);
}

export function weekdayDate(date: string): string {
    return new Date(date + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
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
