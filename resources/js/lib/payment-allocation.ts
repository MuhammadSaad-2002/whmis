export type PartyType = 'customer' | 'company';

export interface OpenInvoice {
    id: number;
    invoice_type: 'sales_invoice' | 'purchase_invoice';
    invoice_number: string;
    invoice_date: string;
    total_amount: number;
    outstanding: number;
}

export interface PaymentParty {
    id: number;
    name: string;
}

export type PaymentParties = Record<PartyType, PaymentParty[]>;

export const paymentMethods = {
    cash: 'Cash',
    bank: 'Bank Transfer',
    cheque: 'Cheque',
    online: 'Online Wallet',
    adjustment: 'Adjustment',
};

export const invoiceKey = (invoice: OpenInvoice) => `${invoice.invoice_type}:${invoice.id}`;
export const cents = (value: string | number) => Math.round((Number(value) || 0) * 100);

export function oldestFirst(invoices: OpenInvoice[]) {
    return [...invoices].sort((a, b) => a.invoice_date.localeCompare(b.invoice_date) || a.id - b.id);
}

/** Amount and balance are integer minor units; the remainder stays on account. */
export function allocateOldestFirst(sortedInvoices: OpenInvoice[], amount: number): Record<string, string> {
    let remaining = Math.max(0, amount);
    const allocations: Record<string, string> = {};
    for (const invoice of sortedInvoices) {
        if (remaining <= 0) break;
        const allocated = Math.min(remaining, cents(invoice.outstanding));
        if (allocated <= 0) continue;
        allocations[invoiceKey(invoice)] = (allocated / 100).toFixed(2);
        remaining -= allocated;
    }
    return allocations;
}

export function paymentToday() {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

export function invoiceAge(date: string, today: string) {
    return Math.max(0, Math.floor((Date.parse(today) - Date.parse(date)) / 86_400_000));
}

export const ageBucket = (age: number) => age > 90 ? 3 : age > 60 ? 2 : age > 30 ? 1 : 0;
