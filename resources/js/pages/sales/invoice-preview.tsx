import { amount, money, qty, shortDate } from '@/lib/format';
import { openWorkspaceTab } from '@/lib/embedded';
import { Link } from '@inertiajs/react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ExternalLink, FileText, Printer, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface InvoiceRow {
    id: number;
    invoice_number: string;
    customer: { name: string; city: string | null } | null;
    invoice_date: string;
    sale_type: string;
    status: 'draft' | 'posted' | 'cancelled';
    return_status?: 'posted_no_returns' | 'partially_returned' | 'fully_returned';
    total_amount: string;
    returned_amount: number | string;
    net_amount: number | string;
    net_profit: number | string | null;
    margin: number | string | null;
}

export const saleTypes = [
    ['credit', 'Credit', 'Credit'], ['cash', 'Cash', 'Cash'], ['booking', 'Booking', 'Booking'],
    ['sale_base', 'Sale Base', 'SaleBase'], ['direct', 'Direct', 'Direct'],
] as const;

export const listDate = (value: string) => shortDate(value.slice(0, 10) + 'T00:00:00');

export function SaleType({ type }: { type: string }) {
    const option = saleTypes.find((item) => item[0] === type);
    return <span className={`type ${option?.[2] ?? ''}`}><i />{option?.[1] ?? type}</span>;
}

export function SaleStatus({ invoice }: { invoice: InvoiceRow }) {
    return <>
        <span className={`st ${invoice.status}`}>{invoice.status}</span>
        {invoice.status === 'posted' && invoice.return_status === 'fully_returned' && <span className="ret full">Fully returned</span>}
        {invoice.status === 'posted' && invoice.return_status === 'partially_returned' && <span className="ret part">Part return</span>}
    </>;
}

interface Preview {
    items: { id: number; product: string | null; batch: string | null; qty: string; bonus: string; rate: string; amount: string }[];
    created_at: string | null;
    creator: string | null;
    posted_at: string | null;
    returns: { number: string; date: string; amount: string }[];
    paid: number | null;
    outstanding: number | null;
}

interface Props {
    invoice: InvoiceRow;
    close: () => void;
    canEdit: boolean;
    canReturn: boolean;
    post?: () => void;
    busy: boolean;
}

const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Karachi' });

export function InvoicePreview({ invoice, close, canEdit, canReturn, post, busy }: Props) {
    const [data, setData] = useState<Preview>();
    const [failed, setFailed] = useState(false);
    const [revision, setRevision] = useState(0);
    const focus = useRef(typeof document === 'undefined' ? null : document.activeElement);
    const editUrl = route('sales.edit', invoice.id, false);
    const returnUrl = route('returns.sales.create', { invoice_id: invoice.id }, false);
    const closeButton = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const controller = new AbortController();
        async function load() {
            try {
                const response = await fetch(route('sales.preview', invoice.id, false), {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (!response.ok) throw new Error('Could not load invoice');
                const payload: Preview = await response.json();
                if (!controller.signal.aborted) setData(payload);
            } catch {
                if (!controller.signal.aborted) setFailed(true);
            }
        }
        void load();
        return () => controller.abort();
    }, [invoice.id, revision]);

    return <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) close(); }}>
        <Dialog.Portal>
            <Dialog.Overlay className="sales-preview-overlay" />
            <Dialog.Content className="sales-preview"
                onOpenAutoFocus={(event) => { event.preventDefault(); closeButton.current?.focus(); }}
                onCloseAutoFocus={(event) => {
                    if (focus.current instanceof HTMLElement && focus.current.isConnected) {
                        event.preventDefault();
                        focus.current.focus({ preventScroll: true });
                    }
                }}>
                <div className="dh">
                    <div><Dialog.Title>{invoice.invoice_number}</Dialog.Title>
                        <Dialog.Description className="sub">{[invoice.customer?.name?.toUpperCase(), invoice.customer?.city, listDate(invoice.invoice_date)].filter(Boolean).join(' · ')}</Dialog.Description>
                        <div className="badges"><SaleStatus invoice={invoice} /><SaleType type={invoice.sale_type} /></div>
                    </div>
                    <div className="sp" />
                    <Dialog.Close ref={closeButton} type="button" className="ib" aria-label="Close invoice preview" disabled={busy}><X className="i" /></Dialog.Close>
                </div>
                <div className="db" aria-busy={!data && !failed}>
                    <div className="dgrid">
                        <div><small>Invoice total</small><b className="num">{money(invoice.total_amount)}</b></div>
                        <div><small>Returns</small><b className={`num ${Number(invoice.returned_amount) ? 'neg' : ''}`}>{Number(invoice.returned_amount) ? '−' : ''}{money(invoice.returned_amount)}</b></div>
                        <div><small>Net</small><b className="num">{money(invoice.net_amount)}</b></div>
                        <div><small>Profit · margin</small><b className="num">{invoice.net_profit == null ? '—' : `${money(invoice.net_profit)} · ${invoice.margin == null ? '—' : Number(invoice.margin).toFixed(1) + '%'}`}</b></div>
                    </div>
                    {invoice.net_profit != null && Number(invoice.net_profit) === 0 && Number(invoice.net_amount) > 0 &&
                        <div className="warn"><strong>Zero margin.</strong> This invoice has no net profit after posted returns.</div>}
                    {!data && !failed && <p role="status" className="muted">Loading invoice details…</p>}
                    {failed && <p role="alert">Couldn’t load invoice details. <button className="btn" type="button" onClick={() => { setFailed(false); setRevision((n) => n + 1); }}>Retry</button></p>}
                    {data && <>
                        <h3 className="sec">Line items</h3>
                        {data.items.length > 0 ? <table className="items" aria-label="Invoice line items">
                            <thead><tr><th>Product</th><th>Batch</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
                            <tbody>{data.items.map((item) => <tr key={item.id}>
                                <td>{item.product ?? '—'}</td><td className="muted">{item.batch ?? '—'}</td>
                                <td className="r num">{qty(item.qty)}{Number(item.bonus) > 0 && <small className="muted"> +{qty(item.bonus)}</small>}</td>
                                <td className="r num">{amount(item.rate)}</td><td className="r num"><b>{amount(item.amount)}</b></td>
                            </tr>)}</tbody>
                        </table> : <p className="muted">No line items.</p>}
                        {data.paid != null && <><h3 className="sec">Payment</h3><div className="payment-status">
                            <span>Received <b className="num">{money(data.paid)}</b></span>
                            <span>Outstanding <b className={`num ${(data.outstanding ?? 0) > 0 ? 'neg' : ''}`}>{money(data.outstanding)}</b></span>
                        </div></>}
                        <h3 className="sec">Activity</h3>
                        <div className="tl">
                            {data.created_at && <div>Invoice created{invoice.sale_type === 'booking' ? ' from booking' : ''}<small>{dateTime.format(new Date(data.created_at))}{data.creator && ` · ${data.creator}`}</small></div>}
                            {data.posted_at && <div>Posted to ledger<small>{dateTime.format(new Date(data.posted_at))}</small></div>}
                            {data.returns.map((item) => <div key={item.number}>Sales return {item.number} · {money(item.amount)}<small>{listDate(item.date)}</small></div>)}
                            {invoice.status === 'draft' && <div>Awaiting posting</div>}
                            {invoice.status === 'cancelled' && <div>Invoice cancelled</div>}
                        </div>
                    </>}
                </div>
                <div className="df">
                    {invoice.status === 'draft' && post && <button type="button" className="btn pri" disabled={busy} onClick={post}><Check className="i" />Post invoice</button>}
                    {canReturn && <Link className="btn pri" href={returnUrl}><Undo2 className="i" />Create return</Link>}
                    {invoice.status === 'draft' && canEdit && <Link className="btn" href={editUrl}>Edit</Link>}
                    {invoice.status !== 'draft' && <Link className="btn" href={route('sales.summary', invoice.id, false)}><FileText className="i" />Summary</Link>}
                    <a className="btn" target="_blank" rel="noreferrer" href={route('sales.print', invoice.id, false)}><Printer className="i" />Print</a>
                    <button className="btn workspace-open" type="button" onClick={() => openWorkspaceTab(editUrl)} aria-label="Open in workspace tab" title="Open in workspace tab"><ExternalLink className="i" /></button>
                </div>
            </Dialog.Content>
        </Dialog.Portal>
    </Dialog.Root>;
}
