import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { qty as fmtQty } from '@/lib/format';
import { useEffect, useState } from 'react';

export interface BatchOption {
    id: number;
    batch_number: string;
    expiry_date: string | null;
    qty_available: number;
}

interface Props {
    productId: number | null;
    warehouseId: number;
    value: string; // selected batch id, '' = none
    onSelect: (batchId: string, qtyAvailable: number) => void;
    disabled?: boolean;
    invalid?: boolean;
    registerRef?: (el: HTMLElement | null) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    // Keeps a batch visible even when it is out of stock (editing a draft or a
    // posted invoice whose batch has since been consumed).
    fallback?: { id: number; batch_number: string; expiry_date: string | null } | null;
}

const label = (b: { batch_number: string; qty_available?: number }) =>
    b.qty_available !== undefined ? `${b.batch_number} · ${fmtQty(b.qty_available)}` : b.batch_number;

/**
 * In-grid batch picker: lists the product's in-stock batches, most-recently
 * received first. Required — there is no auto/FIFO option.
 */
export function BatchSelectCell({ productId, warehouseId, value, onSelect, disabled, invalid, registerRef, onKeyDown, fallback }: Props) {
    const [batches, setBatches] = useState<BatchOption[]>([]);

    useEffect(() => {
        if (!productId) {
            setBatches([]);
            return;
        }
        const controller = new AbortController();
        (async () => {
            try {
                const response = await fetch(`/lookup/products/${productId}/batches?warehouse_id=${warehouseId}`, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (response.ok) {
                    const data: BatchOption[] = await response.json();
                    // Newest received first (endpoint returns FIFO/earliest-expiry order).
                    data.sort((a, b) => b.id - a.id);
                    setBatches(data);
                }
            } catch {
                /* aborted */
            }
        })();
        return () => controller.abort();
    }, [productId, warehouseId]);

    // Merge the fallback batch in if it isn't part of the in-stock list.
    const options: BatchOption[] = [...batches];
    if (fallback && !options.some((b) => b.id === fallback.id)) {
        options.unshift({ ...fallback, qty_available: 0 });
    }

    const ringClass = invalid ? 'bg-destructive/10 ring-1 ring-destructive' : '';

    // Readonly with no loaded options: show the batch number as static text.
    if (disabled && options.length === 0) {
        return <div className="h-8 truncate px-2 py-1.5 text-sm">{fallback?.batch_number ?? ''}</div>;
    }

    return (
        <Select value={value || undefined} onValueChange={(v) => onSelect(v, options.find((b) => String(b.id) === v)?.qty_available ?? 0)} disabled={disabled || !productId}>
            <SelectTrigger
                ref={registerRef as never}
                onKeyDown={onKeyDown}
                aria-invalid={invalid}
                className={`h-8 rounded-none border-0 px-2 text-sm focus-visible:ring-1 ${ringClass}`}
            >
                <SelectValue placeholder="Select batch" />
            </SelectTrigger>
            <SelectContent>
                {options.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>
                        {label(b)}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
