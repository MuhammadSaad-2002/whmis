import { ReturnLineCell } from '@/components/return-line-cell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useKeyboardGrid } from '@/hooks/use-keyboard-grid';
import { amount, qty as fmtQty, toNumber } from '@/lib/format';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

/** A returnable invoice line, normalized across sales/purchase returns. */
export interface ReturnableLine {
    line_id: number; // sales_invoice_item_id | purchase_invoice_item_id
    product: string;
    company: string | null;
    batch_number: string | null;
    returnable: number;
    bonus_returnable?: number;
    unit_amount: number; // refund/unit (sales) | rate (purchase)
}

export interface ReturnRow {
    line_id: string;
    qty: string;
    bonus_qty?: string;
}

export const emptyReturnRow = (): ReturnRow => ({ line_id: '', qty: '' });

const labelFor = (l: ReturnableLine) =>
    `${l.product}${l.company ? ` · ${l.company}` : ''}${l.batch_number ? ` · ${l.batch_number}` : ''} · ${fmtQty(l.returnable)}${l.bonus_returnable ? ` + ${fmtQty(l.bonus_returnable)} bonus` : ''} left`;

interface Props {
    lines: ReturnableLine[];
    rows: ReturnRow[];
    setRows: React.Dispatch<React.SetStateAction<ReturnRow[]>>;
    amountHeader?: string;
    showBonus?: boolean;
}

/**
 * Invoice-based return line entry — same keyboard grid as the sales/purchase
 * invoice forms. The product cell is a dropdown limited to the invoice's
 * returnable lines; qty is capped at the returnable amount.
 */
export function ReturnGrid({ lines, rows, setRows, amountHeader = 'Amount', showBonus = false }: Props) {
    const lineById = new Map(lines.map((l) => [String(l.line_id), l]));
    const chosen = new Set(rows.map((r) => r.line_id).filter(Boolean));
    const [searchSignal, setSearchSignal] = useState({ row: -1, n: 0 });

    const grid = useKeyboardGrid({
        appendOnArrowDown: false,
        rowCount: rows.length,
        colCount: showBonus ? 3 : 2,
        enterOrder: showBonus ? [0, 1, 2] : [0, 1],
        onAppendRow: () => setRows((r) => [...r, emptyReturnRow()]),
        onDeleteRow: (row) => setRows((r) => (r.length === 1 ? [emptyReturnRow()] : r.filter((_, i) => i !== row))),
        onInsertRow: (row) => setRows((r) => { const c = [...r]; c.splice(row + 1, 0, emptyReturnRow()); return c; }),
        onProductSearch: (row) => setSearchSignal((s) => ({ row, n: s.n + 1 })),
    });

    // Focus the first product cell once the grid mounts (after an invoice is
    // chosen) so the user can type-search without clicking.
    useEffect(() => {
        grid.focusCell(0, 0);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const setRow = (i: number, patch: Partial<ReturnRow>) =>
        setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

    const removeRow = (i: number) =>
        setRows((r) => (r.length === 1 ? [emptyReturnRow()] : r.filter((_, idx) => idx !== i)));

    return (
        <div className="rounded-xl border">
            <div className="max-h-[55dvh] overflow-auto">
            <table className={`w-full text-sm ${showBonus ? 'min-w-[860px]' : 'min-w-[760px]'}`}>
                <thead className="sticky top-0 z-10 bg-muted text-xs uppercase">
                    <tr className="[&>th]:border-b [&>th]:px-2 [&>th]:py-2 [&>th]:text-left">
                        <th className="w-8">#</th>
                        <th className="min-w-64">Product</th>
                        <th className="w-28">Batch</th>
                        <th className="w-24 text-right">Returnable</th>
                        <th className="w-24 text-right">{showBonus ? 'Billed Return' : 'Return Qty'}</th>
                        {showBonus && <th className="w-24 text-right">Bonus Return</th>}
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
                        const bonusLimit = line?.bonus_returnable ?? 0;
                        const over = !!line && q > line.returnable + 1e-9;
                        const bonusOver = toNumber(row.bonus_qty ?? '') > bonusLimit + 1e-9;
                        const lineAmount = line ? q * line.unit_amount : 0;
                        return (
                            <tr key={i} className="border-b last:border-0 [&>td]:border-r [&>td]:p-0 [&>td:last-child]:border-r-0">
                                <td className="px-2 text-center text-muted-foreground">{i + 1}</td>
                                <td>
                                    <ReturnLineCell
                                        value={line ? line.product : ''}
                                        options={options}
                                        openSignal={searchSignal.row === i ? searchSignal.n : 0}
                                        inputRef={grid.registerCell(i, 0)}
                                        onGridKeyDown={(e) => grid.handleKeyDown(e, i, 0)}
                                        onSelect={(v) => setRow(i, v === row.line_id ? { line_id: v } : { line_id: v, qty: '', bonus_qty: '' })}
                                    />
                                </td>
                                <td className="px-2 text-sm">{line?.batch_number ?? '—'}</td>
                                <td className="px-2 text-right tabular-nums">{line ? fmtQty(line.returnable) : ''}{bonusLimit > 0 && <div className="text-xs text-muted-foreground">+ {fmtQty(bonusLimit)} bonus</div>}</td>
                                <td>
                                    <Input
                                        ref={grid.registerCell(i, 1) as never}
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        max={line?.returnable}
                                        aria-label={showBonus ? `Billed return quantity, row ${i + 1}` : `Return quantity, row ${i + 1}`}
                                        value={row.qty}
                                        placeholder="0"
                                        onChange={(e) => setRow(i, { qty: e.target.value })}
                                        onKeyDown={(e) => grid.handleKeyDown(e, i, 1)}
                                        title={over ? 'Return quantity exceeds returnable.' : undefined}
                                        className={`h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1 ${over ? 'bg-destructive/10 ring-1 ring-destructive' : ''}`}
                                    />
                                </td>
                                {showBonus && <td>
                                    <Input
                                        ref={grid.registerCell(i, 2) as never}
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        max={bonusLimit}
                                        aria-label={`Bonus return quantity, row ${i + 1}`}
                                        value={row.bonus_qty ?? ''}
                                        placeholder="0"
                                        onChange={(e) => setRow(i, { bonus_qty: e.target.value })}
                                        onKeyDown={(e) => grid.handleKeyDown(e, i, 2)}
                                        title={bonusOver ? 'Bonus return quantity exceeds returnable.' : undefined}
                                        className={`h-8 rounded-none border-0 px-2 text-right text-sm focus-visible:ring-1 ${bonusOver ? 'bg-destructive/10 ring-1 ring-destructive' : ''}`}
                                    />
                                </td>}
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
            </div>
            <div className="border-t p-2">
                <Button variant="ghost" size="sm" onClick={() => setRows((r) => [...r, emptyReturnRow()])}>
                    <Plus className="mr-1 size-4" /> Add Row
                </Button>
            </div>
        </div>
    );
}
