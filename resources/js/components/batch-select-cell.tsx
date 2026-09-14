import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { qty as fmtQty } from '@/lib/format';
import { useEffect, useRef, useState } from 'react';

export interface BatchOption {
    id: number;
    batch_number: string;
    expiry_date: string | null;
    qty_available: number;
    trade_price?: number;
}

interface Props {
    productId: number | null;
    warehouseId: number;
    value: string; // selected batch id, '' = none
    onSelect: (batchId: string, qtyAvailable: number, tradePrice: number) => void;
    disabled?: boolean;
    invalid?: boolean;
    openSignal?: number;
    registerRef?: (el: HTMLElement | null) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    // Keeps a batch visible even when it is out of stock (editing a draft or a
    // posted invoice whose batch has since been consumed).
    fallback?: { id: number; batch_number: string; expiry_date: string | null } | null;
}

const label = (b: { batch_number: string; qty_available?: number }) =>
    b.qty_available !== undefined ? `${b.batch_number} · ${fmtQty(b.qty_available)}` : b.batch_number;

/**
 * In-grid batch picker: type-to-search the product's in-stock batches, most
 * recently received first. Required — there is no auto/FIFO option. While the
 * dropdown is closed, keys flow to the grid so Enter proceeds to the next cell.
 */
export function BatchSelectCell({ productId, warehouseId, value, onSelect, disabled, invalid, openSignal, registerRef, onKeyDown, fallback }: Props) {
    const [batches, setBatches] = useState<BatchOption[]>([]);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [highlight, setHighlight] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);
    const localInput = useRef<HTMLInputElement | null>(null);

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
                    data.sort((a, b) => b.id - a.id); // newest received first
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

    const selected = options.find((b) => String(b.id) === value);
    const display = selected?.batch_number ?? fallback?.batch_number ?? '';
    const filtered = query.trim() ? options.filter((b) => b.batch_number.toLowerCase().includes(query.toLowerCase())) : options;

    const lastSignal = useRef(openSignal ?? 0);
    useEffect(() => {
        if (openSignal && openSignal !== lastSignal.current) {
            lastSignal.current = openSignal;
            localInput.current?.focus();
            openDropdown();
        }
    }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [highlight]);

    const openDropdown = () => {
        setQuery('');
        setHighlight(0);
        setOpen(true);
    };

    const select = (b: BatchOption) => {
        setOpen(false);
        setQuery('');
        onSelect(String(b.id), b.qty_available, b.trade_price ?? 0);
    };

    const ring = invalid ? 'bg-destructive/10 ring-1 ring-destructive' : '';

    // Readonly with no loaded options: show the batch number as static text.
    if (disabled && options.length === 0) {
        return <div className="h-8 truncate px-2 py-1.5 text-sm">{display}</div>;
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (open) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setHighlight((h) => Math.min(h + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (filtered[highlight]) select(filtered[highlight]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setQuery('');
            } else if (e.key === 'Tab') {
                setOpen(false);
                setQuery('');
            }
            return;
        }
        if (e.key === 'Enter' && !value) {
            e.preventDefault();
            openDropdown();
            return;
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            // let the grid move rows
            onKeyDown?.(e);
            return;
        }
        onKeyDown?.(e);
    };

    return (
        <Popover open={open}>
            <PopoverAnchor asChild>
                <Input
                    ref={(el) => {
                        localInput.current = el;
                        registerRef?.(el);
                    }}
                    value={open ? query : display}
                    disabled={disabled || !productId}
                    placeholder="Select batch"
                    aria-invalid={invalid}
                    onMouseDown={() => {
                        if (!open && productId && !disabled) openDropdown();
                    }}
                    onChange={(e) => {
                        if (!open) setOpen(true);
                        setQuery(e.target.value);
                        setHighlight(0);
                    }}
                    onKeyDown={handleKeyDown}
                    className={`h-8 rounded-none border-0 px-2 text-sm focus-visible:ring-1 ${ring}`}
                    autoComplete="off"
                />
            </PopoverAnchor>
            <PopoverContent
                align="start"
                sideOffset={2}
                className="w-64 max-w-[90vw] p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={() => {
                    setOpen(false);
                    setQuery('');
                }}
            >
                <div ref={listRef} className="max-h-72 overflow-y-auto">
                    {filtered.length === 0 && (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">No in-stock batches.</p>
                    )}
                    {filtered.map((b, index) => (
                        <div
                            key={b.id}
                            data-index={index}
                            role="option"
                            aria-selected={index === highlight}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => select(b)}
                            onMouseMove={() => setHighlight(index)}
                            className={`cursor-pointer border-b px-3 py-1.5 text-sm last:border-0 ${index === highlight ? 'bg-accent text-accent-foreground' : ''}`}
                        >
                            {label(b)}
                            {b.expiry_date && <span className="ml-2 text-xs text-muted-foreground">exp {b.expiry_date}</span>}
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
