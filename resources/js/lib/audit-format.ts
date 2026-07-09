/**
 * Presentation helpers for the Audit Log — turn raw column names and values
 * into something a non-technical user can read.
 */

// Technical columns that carry no meaning to a reader — the Record column
// already identifies the row, and timestamps are implicit.
export const HIDDEN_FIELDS = new Set(['id', 'created_at', 'updated_at', 'deleted_at']);

// Explicit labels for the important or ambiguous columns. Anything not listed
// falls back to the heuristic in fieldLabel().
const LABELS: Record<string, string> = {
    customer_id: 'Customer',
    company_id: 'Supplier',
    product_id: 'Product',
    warehouse_id: 'Warehouse',
    category_id: 'Category',
    batch_id: 'Batch',
    sales_invoice_id: 'Sales Invoice',
    purchase_invoice_id: 'Purchase Invoice',
    booking_id: 'Booking',
    incentive_rule_id: 'Incentive Rule',
    created_by: 'Created By',
    updated_by: 'Updated By',
    approved_by: 'Approved By',
    booker_id: 'Booker',
    user_id: 'User',
    gst_percent: 'GST %',
    tax_percent: 'Tax %',
    discount_percent: 'Discount %',
    invoice_number: 'Invoice #',
    manual_number: 'Manual #',
    booking_number: 'Booking #',
    batch_number: 'Batch #',
    supplier_invoice_number: 'Supplier Invoice #',
    sale_type: 'Sale Type',
    sale_terms: 'Sale Terms',
    purchase_type: 'Purchase Type',
    trade_price: 'Trade Price',
    retail_price: 'Retail Price',
    purchase_price: 'Purchase Price',
    purchase_rate: 'Purchase Rate',
    opening_balance: 'Opening Balance',
    credit_limit: 'Credit Limit',
    credit_days: 'Credit Days',
    bonus_quantity: 'Bonus Qty',
    requested_bonus: 'Requested Bonus',
    qty_available: 'Available Qty',
    qty_reserved: 'Reserved Qty',
    is_active: 'Active',
    invoice_date: 'Invoice Date',
    due_date: 'Due Date',
    booking_date: 'Booking Date',
    expiry_date: 'Expiry Date',
    drug_license_no: 'Drug License No',
    registration_no: 'Registration No',
    owner_name: 'Owner Name',
    contact_person: 'Contact Person',
    generic_name: 'Generic Name',
    pack_size: 'Pack Size',
    min_stock: 'Min Stock',
    reorder_level: 'Reorder Level',
    ntn: 'NTN',
    strn: 'STRN',
    cnic: 'CNIC',
    sku: 'SKU',
    mrp: 'MRP',
};

const ACRONYMS = new Set(['id', 'ntn', 'strn', 'cnic', 'sku', 'mrp', 'gst', 'no', 'whatsapp']);

/** Human label for a database column name. */
export function fieldLabel(key: string): string {
    if (LABELS[key]) return LABELS[key];

    return key
        .replace(/_id$/, '') // "supplier_id" → "supplier"
        .split('_')
        .map((word) => (ACRONYMS.has(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)))
        .join(' ')
        .trim();
}

/** Readable rendering of an audit value. */
export function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}
