import { toNumber } from './format';

/**
 * Client mirror of app/Services/MarginCalculator.php.
 * Used for live grid display only — the server recomputes on save/post.
 */

export interface LineInput {
    quantity: number | string;
    bonus_quantity?: number | string;
    rate: number | string; // purchase_rate or trade_price
    trade_price?: number | string; // for purchase margin
    discount_percent?: number | string;
    gst_percent?: number | string;
}

export interface LineComputed {
    gross: number;
    discount_amount: number;
    gst_amount: number;
    net_amount: number;
    margin: number;
    margin_percent: number;
    effective_cost: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function computeLine(input: LineInput, withMargin: boolean): LineComputed {
    const quantity = toNumber(input.quantity);
    const bonus = toNumber(input.bonus_quantity);
    const rate = toNumber(input.rate);
    const trade = toNumber(input.trade_price);

    const gross = r2(quantity * rate);
    const discount = r2((gross * toNumber(input.discount_percent)) / 100);
    const taxable = gross - discount;
    const gst = r2((taxable * toNumber(input.gst_percent)) / 100);
    const net = r2(taxable + gst);

    const totalUnits = quantity + bonus;
    const effectiveCost = totalUnits > 0 ? r4(net / totalUnits) : 0;
    const margin = withMargin ? r2(trade * totalUnits - net) : 0;

    return {
        gross,
        discount_amount: discount,
        gst_amount: gst,
        net_amount: net,
        margin,
        margin_percent: withMargin && net > 0 ? r2((margin / net) * 100) : 0,
        effective_cost: effectiveCost,
    };
}

export interface TotalsInput {
    discount_percent?: number | string;
    gst_percent?: number | string;
}

export function computeTotals(lines: LineComputed[], header: TotalsInput) {
    const subtotal = r2(lines.reduce((s, l) => s + l.gross, 0));
    const itemDiscount = r2(lines.reduce((s, l) => s + l.discount_amount, 0));
    const itemGst = r2(lines.reduce((s, l) => s + l.gst_amount, 0));
    const itemNet = r2(lines.reduce((s, l) => s + l.net_amount, 0));
    const margin = r2(lines.reduce((s, l) => s + l.margin, 0));

    const invDiscount = r2((itemNet * toNumber(header.discount_percent)) / 100);
    const afterDiscount = itemNet - invDiscount;
    const invGst = r2((afterDiscount * toNumber(header.gst_percent)) / 100);
    const total = r2(afterDiscount + invGst);

    return {
        subtotal,
        item_discount_total: itemDiscount,
        item_gst_total: itemGst,
        discount_amount: invDiscount,
        gst_amount: invGst,
        total_amount: total,
        total_margin: margin,
    };
}
