import { MasterStatus, RegisterLayout, RegisterMetric } from '@/components/master-register';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { usePermissions } from '@/hooks/use-permissions';
import AppLayout from '@/layouts/app-layout';
import { dec2, money, qty, roundedTotalMoney, shortDate, totalMoney } from '@/lib/format';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import { FileDown, Plus, Printer } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { SaleType } from './invoice-preview';
import './invoice-summary.css';

interface Figures {
    amount: number;
    qty: number;
    discount: number;
    tax: number;
    receivable: number;
    cost: number;
}

interface ReturnLine {
    id: number;
    return_number: string;
    date: string;
    status: string;
    amount: number;
    receivable: number;
    qty: number;
    discount: number;
    tax: number;
    cost: number;
}

interface Position {
    original: Figures;
    returns: ReturnLine[];
    returned: Figures;
    net: Figures;
    actual_received: number;
    noncash_settlement: number;
    final_outstanding: number;
    refund_due: number;
    applied_credit?: number;
    status: string;
}

interface ItemIncentive {
    id: number;
    rule_name: string;
    rule_type: string;
    value_given: string;
}

interface InvoiceItem {
    id: number;
    quantity: string;
    bonus_quantity: string;
    trade_price: string;
    discount_amount: string;
    gst_amount: string;
    net_amount: string;
    product?: { name: string };
    batch?: { batch_number: string };
    incentives?: ItemIncentive[];
}

interface Invoice {
    id: number;
    invoice_number: string;
    invoice_date: string;
    status: string;
    sale_type: string;
    customer?: { name: string; city: string | null };
    warehouse?: { name: string };
    items: InvoiceItem[];
}

interface Props {
    invoice: Invoice;
    position: Position;
    paymentHistory?: {id: number; amount: string; payment: {payment_number: string; status: string; method: string; payment_date: string} | null}[];
    refundHistory?: {id: number; kind: string; status: string; amount_paisa: number}[];
}

const returnLabels: Record<string, string> = {
    posted_no_returns: 'No returns',
    partially_returned: 'Partially returned',
    fully_returned: 'Fully returned',
};

const comparisons: { label: string; key: keyof Figures; format: (value: number) => string }[] = [
    { label: 'Amount', key: 'amount', format: money },
    { label: 'Stock Qty (Incl. Bonus)', key: 'qty', format: qty },
    { label: 'Discount', key: 'discount', format: money },
    { label: 'Tax (GST)', key: 'tax', format: money },
    { label: 'Receivable', key: 'receivable', format: money },
];

function TableBlock({ title, columns, className, children }: {
    title: string;
    columns: { label: string; numeric?: boolean }[];
    className?: string;
    children: ReactNode;
}) {
    return <div className="tblwrap" tabIndex={0} role="region" aria-label={title}>
        <Table className={className}>
            <TableHeader><TableRow>{columns.map(({ label, numeric }) =>
                <TableHead key={label} scope="col" className={numeric ? 'r' : undefined}>{label}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{children}</TableBody>
        </Table>
    </div>;
}

function Section({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
    const id = useId();
    return <section className="card list" aria-labelledby={id}>
        <header className="filters invoice-summary-section">
            <div><h2 id={id}>{title}</h2>{detail && <p className="muted">{detail}</p>}</div>
        </header>
        {children}
    </section>;
}

function RecordStatus({ status }: { status: string }) {
    const tone = ['posted', 'completed', 'approved'].includes(status) ? 'positive'
        : ['cancelled', 'rejected', 'withdrawn'].includes(status) ? 'negative'
        : ['draft', 'pending', 'requested'].includes(status) ? 'attention' : 'neutral';
    return <MasterStatus status={status.replaceAll('_', ' ')} tone={tone} />;
}

export default function SalesSummary({ invoice, position, paymentHistory = [], refundHistory = [] }: Props) {
    const { can } = usePermissions();
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Sales', href: '/sales' },
        { title: invoice.invoice_number, href: route('sales.summary', invoice.id) },
    ];
    const posted = invoice.status === 'posted';
    const showRefund = position.refund_due > 0;
    const appliedCredit = Number(position.applied_credit ?? 0);

    return <AppLayout breadcrumbs={breadcrumbs}>
        <Head title={`${invoice.invoice_number} — Summary`} />
        <div className="invoice-summary">
            <RegisterLayout title={invoice.invoice_number}
                description={<>Sales invoice summary <span className="invoice-summary-status">
                    <RecordStatus status={invoice.status} />
                    {posted && <MasterStatus status={returnLabels[position.status] ?? 'No returns'}
                        tone={position.status === 'fully_returned' ? 'negative' : position.status === 'partially_returned' ? 'attention' : 'neutral'} />}
                </span></>}
                actions={<div className="register-hero-actions" aria-label="Invoice actions" role="group">
                    {can('finance.request') && showRefund && <>
                        <Link className="hbtn" href={`/finance-approvals?kind=refund&invoice_id=${invoice.id}`}>Process refund</Link>
                        <Link className="hbtn" href={`/finance-approvals?kind=credit_apply&invoice_id=${invoice.id}`}>Apply credit</Link>
                    </>}
                    {can('finance.request') && can('commission.manage') && posted &&
                        <Link className="hbtn" href={`/finance-approvals?kind=commission_share&invoice_id=${invoice.id}`}>Request commission split</Link>}
                    <a className="hbtn" href={route('sales.print', invoice.id)} target="_blank" rel="noreferrer">
                        <Printer className="i" aria-hidden="true" />Original Invoice
                    </a>
                    <a className="hbtn" href={route('sales.net-position', invoice.id)} target="_blank" rel="noreferrer">
                        <FileDown className="i" aria-hidden="true" />Net Position PDF
                    </a>
                    {can('returns.manage') && posted && position.status !== 'fully_returned' &&
                        <Link className="hbtn pri" href={route('returns.sales.create', { invoice_id: invoice.id })}>
                            <Plus className="i" aria-hidden="true" />New Return
                        </Link>}
                </div>}>
                <section className="register-stats" aria-label="Invoice balances">
                    <RegisterMetric label="Net Receivable" value={roundedTotalMoney(position.net.receivable)} color="var(--sales)" />
                    <RegisterMetric label="Amount Received" value={roundedTotalMoney(position.actual_received)} color="var(--teal)"
                        detail={[
                            !Number.isInteger(position.actual_received) ? `${money(position.actual_received)} actually received` : '',
                            position.noncash_settlement > 0 ? `${totalMoney(position.noncash_settlement)} settled without cash` : '',
                        ].filter(Boolean).join(' · ') || undefined} />
                    <RegisterMetric label={showRefund ? 'Refund Due to Customer' : 'Final Outstanding'}
                        value={roundedTotalMoney(showRefund ? position.refund_due : position.final_outstanding)}
                        detail={!Number.isInteger(showRefund ? position.refund_due : position.final_outstanding)
                            ? `Exact balance: ${money(showRefund ? position.refund_due : position.final_outstanding)}` : undefined}
                        color={showRefund ? 'var(--amber)' : position.final_outstanding > 0 ? 'var(--red)' : 'var(--green)'} />
                </section>

                <Section title="Original Invoice" detail="Invoice details and the items originally sold.">
                    <dl className="invoice-summary-details">
                        <div><dt>Customer</dt><dd>{invoice.customer?.name ?? '—'}</dd></div>
                        <div><dt>City</dt><dd>{invoice.customer?.city ?? '—'}</dd></div>
                        <div><dt>Invoice Date</dt><dd>{shortDate(invoice.invoice_date)}</dd></div>
                        <div><dt>Sale Type</dt><dd><SaleType type={invoice.sale_type} /></dd></div>
                    </dl>
                    <TableBlock title="Original invoice items" className="summary-line-table" columns={[
                        { label: 'Product' }, { label: 'Batch' }, { label: 'Qty', numeric: true }, { label: 'Price', numeric: true },
                        { label: 'Discount', numeric: true }, { label: 'GST', numeric: true }, { label: 'Net', numeric: true },
                    ]}>
                        {invoice.items.length === 0 && <TableRow><TableCell className="empty" colSpan={7}>No invoice items recorded.</TableCell></TableRow>}
                        {invoice.items.map(item => {
                            const gross = Number(item.quantity) * Number(item.trade_price);
                            const discountPercent = gross > 0 ? Number(item.discount_amount) / gross * 100 : 0;
                            return <TableRow key={item.id}>
                                <TableCell className="entity-name">
                                    <strong>{item.product?.name ?? '—'}</strong>
                                    {!!item.incentives?.length && <div className="invoice-summary-incentives">
                                        {item.incentives.map(incentive => <span key={incentive.id} className="st master-tag">
                                            {incentive.rule_name}{Number(incentive.value_given) > 0 && ` · ${money(incentive.value_given)}`}
                                        </span>)}
                                    </div>}
                                </TableCell>
                                <TableCell className="muted">{item.batch?.batch_number ?? 'FIFO'}</TableCell>
                                <TableCell className="r num">
                                    {qty(item.quantity)}
                                    {Number(item.bonus_quantity) > 0 && <span className="st register-positive invoice-summary-bonus" title="Bonus units">+{qty(item.bonus_quantity)} bonus</span>}
                                </TableCell>
                                <TableCell className="r num">{money(item.trade_price)}</TableCell>
                                <TableCell className="r num">
                                    {money(item.discount_amount)}{discountPercent > 0 && <span className="row-secondary">({dec2(discountPercent)}%)</span>}
                                </TableCell>
                                <TableCell className="r num">{money(item.gst_amount)}</TableCell>
                                <TableCell className="r num font-bold">{money(item.net_amount)}</TableCell>
                            </TableRow>;
                        })}
                    </TableBlock>
                </Section>

                <Section title="Return History" detail="Returns recorded against this invoice.">
                    {position.returns.length === 0 ? <p className="empty">No returns against this invoice.</p> :
                        <TableBlock title="Invoice returns" className="summary-line-table" columns={[
                            { label: 'Return #' }, { label: 'Date' }, { label: 'Status' }, { label: 'Qty', numeric: true },
                            { label: 'Discount', numeric: true }, { label: 'Tax', numeric: true }, { label: 'Credit', numeric: true },
                        ]}>
                            {position.returns.map(entry => {
                                const cancelled = entry.status === 'cancelled';
                                return <TableRow key={entry.id} className={cancelled ? 'muted' : undefined}>
                                    <TableCell>
                                        <Link href={route('returns.sales.show', entry.id)} className={cancelled ? 'muted line-through hover:underline' : 'inv hover:underline'}>
                                            {entry.return_number}
                                        </Link>
                                        {!cancelled && can('finance.review') && <Link href={`/finance-reversals/return/${entry.id}`} className="row-secondary hover:underline">Reversal impact</Link>}
                                    </TableCell>
                                    <TableCell>{shortDate(entry.date)}</TableCell>
                                    <TableCell><RecordStatus status={entry.status} /></TableCell>
                                    <TableCell className="r num">{qty(entry.qty)}</TableCell>
                                    <TableCell className="r num">{money(entry.discount)}</TableCell>
                                    <TableCell className="r num">{money(entry.tax)}</TableCell>
                                    <TableCell className={`r num ${cancelled ? 'line-through' : 'font-bold'}`}>{totalMoney(entry.amount)}</TableCell>
                                </TableRow>;
                            })}
                        </TableBlock>}
                </Section>

                <Section title="Net / Final Position" detail="Original figures compared with returns and the remaining net position.">
                    <TableBlock title="Net position breakdown" className="summary-comparison" columns={[
                        { label: 'Measure' }, { label: 'Original', numeric: true }, { label: 'Returned', numeric: true }, { label: 'Net', numeric: true },
                    ]}>
                        {comparisons.map(({ label, key, format }) => <TableRow key={key} className={key === 'receivable' ? 'summary-receivable-row' : undefined}>
                            <TableCell className="wrap-cell font-medium">{label}</TableCell>
                            <TableCell className="r num">{format(position.original[key])}</TableCell>
                            <TableCell className={`r num${position.returned[key] ? ' summary-returned' : ''}`}>
                                {position.returned[key] ? `- ${format(position.returned[key])}` : '—'}
                            </TableCell>
                            <TableCell className="r num font-bold">{format(position.net[key])}</TableCell>
                        </TableRow>)}
                    </TableBlock>
                </Section>

                {(paymentHistory.length > 0 || refundHistory.length > 0 || appliedCredit > 0) && <Section title="Settlement History" detail="Posted amounts can include non-cash settlements. Review Actual Received above for money collected.">
                    <TableBlock title="Invoice settlements" columns={[
                        { label: 'Reference' }, { label: 'Date' }, { label: 'Method' }, { label: 'Status' }, { label: 'Amount', numeric: true },
                    ]}>
                        {paymentHistory.map(entry => <TableRow key={`payment-${entry.id}`}>
                            <TableCell className="font-medium">{entry.payment?.payment_number ?? 'Payment'}</TableCell>
                            <TableCell>{entry.payment?.payment_date ? shortDate(entry.payment.payment_date) : '—'}</TableCell>
                            <TableCell className="capitalize">{entry.payment?.method?.replaceAll('_', ' ') ?? '—'}</TableCell>
                            <TableCell>{entry.payment?.status ? <RecordStatus status={entry.payment.status} /> : '—'}</TableCell>
                            <TableCell className="r num font-bold">{totalMoney(entry.amount)}</TableCell>
                        </TableRow>)}
                        {refundHistory.map(entry => <TableRow key={`finance-${entry.id}`}>
                            <TableCell className="font-medium capitalize">{entry.kind.replaceAll('_', ' ')} #{entry.id}</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell>—</TableCell>
                            <TableCell><RecordStatus status={entry.status} /></TableCell>
                            <TableCell className="r num font-bold">{totalMoney(Number(entry.amount_paisa) / 100)}</TableCell>
                        </TableRow>)}
                        {appliedCredit > 0 && <TableRow className="summary-receivable-row">
                            <TableCell colSpan={4} className="font-medium">Applied customer credit</TableCell>
                            <TableCell className="r num font-bold">{totalMoney(appliedCredit)}</TableCell>
                        </TableRow>}
                    </TableBlock>
                </Section>}
            </RegisterLayout>
        </div>
    </AppLayout>;
}
