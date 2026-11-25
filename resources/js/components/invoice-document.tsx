import { Plus, type LucideIcon } from 'lucide-react';
import './invoice-document.css';

export function InvoiceSummaryTile({ icon: Icon, tone, label, value }: {
    icon: LucideIcon;
    tone: 'teal' | 'red' | 'blue' | 'green';
    label: string;
    value: string;
}) {
    return <div className="invoice-summary-tile">
        <span className="invoice-summary-icon" data-tone={tone}><Icon aria-hidden="true" /></span>
        <div><small>{label}</small><b>{value}</b></div>
    </div>;
}

export function InvoiceLineNumberHeading({ onAdd }: { onAdd?: () => void }) {
    return <th scope="col" className="invoice-line-number-heading">
        <span className="sr-only">Line number</span>
        {onAdd ? <button type="button" className="invoice-add-line" aria-label="Add row" title="Add row" onClick={onAdd}>
            <Plus aria-hidden="true" />
        </button> : <span aria-hidden="true">#</span>}
    </th>;
}
