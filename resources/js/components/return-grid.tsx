import { ReturnLineCell } from '@/components/return-line-cell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useKeyboardGrid } from '@/hooks/use-keyboard-grid';
import { amount, qty as fmtQty, toNumber } from '@/lib/format';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

/** A returnable invoice line, normalized across sales/purchase returns. */
export interface ReturnableLine {
    line_id: number; // sales_invoice_item_id | purchase_invoice_item_id
    product: string;
    company: string | null;
    batch_number: string | null;
    returnable: number;
    unit_amount: number; // refund/unit (sales) | rate (purchase)
}

export interface ReturnRow {
    line_id: string;
    qty: string;
}

export const emptyReturnRow = (): ReturnRow => ({ line_id: '', qty: '' });

const labelFor = (l: ReturnableLine) =>
    `${l.product}${l.company ? ` · ${l.company}` : ''}${l.batch_number ? ` · ${l.batch_number}` : ''} · ${fmtQty(l.returnable)} left`;

interface Props {
    lines: ReturnableLine[];
    rows: ReturnRow[];
    setRows: React.Dispatch<React.SetStateAction<ReturnRow[]>>;
    amountHeader?: string;
}

/**
 * Invoice-based return line entry — same keyboard grid as the sales/purchase
 * invoice forms. The product cell is a dropdown limited to the invoice's
 * returnable lines; qty is capped at the returnable amount.
 */
export function ReturnGrid({ lines, rows, setRows, amountHeader = 'Amount' }: Props) {
    const lineById = new Map(lines.map((l) => [String(l.line_id), l]));
    const chosen = new Set(rows.map((r) => r.line_id).filter(Boolean));
    const [searchSignal, setSearchSignal] = useState({ row: -1, n: 0 });

    const grid = useKeyboardGrid({
        rowCount: rows.length,
        colCount: 2,
        enterOrder: [0, 1],
        onAppendRow: () => setRows((r) => [...r, emptyReturnRow()]),
        onDeleteRow: (row) => setRows((r) => (r.length === 1 ? [emptyReturnRow()] : r.filter((_, i) => i !== row))),
        onInsertRow: (row) => setRows((r) => { const c = [...r]; c.splice(row + 1, 0, emptyReturnRow()); return c; }),
        onProductSearch: (row) => setSearchSignal((s) => ({ row, n: s.n + 1 })),
    });

    const setRow = (i: number, patch: Partial<ReturnRow>) =>
        setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

    const removeRow = (i: number) =>
        setRows((r) => (r.length === 1 ? [emptyReturnRow()] : r.filter((_, idx) => idx !== i)));

    return (
        <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-xs uppercase">
                    <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                        <th className="w-8">#</th>
                        <th className="min-w-64">Product</th>
                        <th className="w-28">Batch</th>
                        <th className="w-24 text-right">Returnable</th>
                        <th className="w-24 text-right">Return Qty</th>
                        <th className="w-28 text-right">{amountHeader}</th>
                        <th className="w-10" />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => {
                        const line = lineById.get(row.line_id);
                        const options = lines
                            .filter((l) => !chosen.has(String(l.line_id)) || String(l.line_id) === row.line_id)
                            .map((l) => ({ value: String(l.line_id), label: labelFor(l) }));
                        const q = toNumber(row.qty);
                        const over = !!line && q > line.returnable + 1e-9;
                        const lineAmount = line ? q * line.unit_amount : 0;
                        return (
                            <tr key={i} className="border-b last:border-0 [&>td]:border-r [&>td]:p-0 [&>td:last-child]:border-r-0">
                                <td className="px-2 text-center text-muted-foreground">{i + 1}</td>
                                <td>
                                    <ReturnLineCell
                                        value={line ? labelFor(line) : ''}
                                        options={options}
                                        openSignal={searchSignal.row === i ? searchSignal.n : 0}
                                        inputRef={grid.registerCell(i, 0)}
                                        onGridKeyDown={(e) => grid.handleKeyDown(e, i, 0)}
                                        onSelect={(v) => setRow(i, { line_id: v })}
                                    />
                                </td>
                                <td className="px-2 text-sm">{line?.batch_number ?? '—'}</td>
                                <td className="px-2 text-right tabular-nums">{line ? fmtQty(line.returnable) : ''}</td>
                                <td>
                                    <Input
                                        ref={grid.registerCell(i, 1) as never}
                                        type="number"
                                        min={0}
                                        max={line?.returnable}
                                        value={row.qty}
                                        placeholder="0"
                                        onChange={(e) => setRow(i, { qty: e.target.value })}
                                        onKeyDown={(e) => grid.handleKeyDown(e, i, 1)}
                                        title={over ? 'Return quantity exceeds returnable.' : undefined}
                                        className={`h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1 ${over ? 'bg-destructive/10 ring-1 ring-destructive' : ''}`}
                                    />
                                </td>
                                <td className="px-2 text-right tabular-nums">{amount(lineAmount)}</td>
                                <td className="px-1 text-center">
                                    <button type="button" tabIndex={-1} onClick={() => removeRow(i)}>
                                        <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <div className="border-t p-2">
                <Button variant="ghost" size="sm" onClick={() => setRows((r) => [...r, emptyReturnRow()])}>
                    <Plus className="mr-1 size-4" /> Add Row
                </Button>
            </div>
        </div>
    );
}
