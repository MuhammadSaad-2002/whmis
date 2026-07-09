import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { qty as fmtQty } from '@/lib/format';
import { useEffect, useRef, useState } from 'react';

export interface PurchaseBatch {
    id: number;
    batch_number: string;
    expiry_date: string | null;
    qty_available: number;
    purchase_rate: number;
    trade_price: number;
    retail_price: number;
}

interface Props {
    productId: number | null;
    warehouseId: number;
    value: string; // chosen existing batch id, '' = new/none
    batchNumber: string; // typed/selected number, shown while closed when no id
    onPickExisting: (batch: PurchaseBatch) => void;
    onCreateNew: (batchNumber: string) => void;
    disabled?: boolean;
    invalid?: boolean;
    registerRef?: (el: HTMLElement | null) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
}

/**
 * Purchase batch entry: type-to-search the product's existing batches to
 * restock one, or type a new batch number to create one. Most-recent first.
 */
export function PurchaseBatchCell({
    productId, warehouseId, value, batchNumber, onPickExisting, onCreateNew, disabled, invalid, registerRef, onKeyDown,
}: Props) {
    const [batches, setBatches] = useState<PurchaseBatch[]>([]);
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
                const response = await fetch(`/lookup/products/${productId}/all-batches?warehouse_id=${warehouseId}`, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (response.ok) setBatches(await response.json());
            } catch {
                /* aborted */
            }
        })();
        return () => controller.abort();
    }, [productId, warehouseId]);

    const q = query.trim().toLowerCase();
    const filtered = q ? batches.filter((b) => b.batch_number.toLowerCase().includes(q)) : batches;
    const exactMatch = batches.some((b) => b.batch_number.toLowerCase() === q);
    const showCreate = q.length > 0 && !exactMatch;
    const createIndex = filtered.length; // create row sits after existing matches

    const display = value ? (batches.find((b) => String(b.id) === value)?.batch_number ?? batchNumber) : batchNumber;

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [highlight]);

    const openDropdown = () => {
        setQuery('');
        setHighlight(0);
        setOpen(true);
    };

    const pick = (b: PurchaseBatch) => {
        setOpen(false);
        setQuery('');
        onPickExisting(b);
    };

    const create = (number: string) => {
        setOpen(false);
        setQuery('');
        onCreateNew(number.trim());
    };

    const ring = invalid ? 'bg-destructive/10 ring-1 ring-destructive' : '';

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (open) {
            const maxIndex = filtered.length + (showCreate ? 1 : 0) - 1;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setHighlight((h) => Math.min(h + 1, Math.max(0, maxIndex)));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (showCreate && highlight === createIndex) create(query);
                else if (filtered[highlight]) pick(filtered[highlight]);
                else if (showCreate) create(query);
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
        if (e.key === 'Enter' && !value && !batchNumber.trim()) {
            e.preventDefault();
            openDropdown();
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
                    placeholder="Batch # (type new or pick)"
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
                className="w-72 max-w-[90vw] p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={() => {
                    setOpen(false);
                    setQuery('');
                }}
            >
                <div ref={listRef} className="max-h-72 overflow-y-auto">
                    {filtered.length === 0 && !showCreate && (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">Type a batch number to create one.</p>
                    )}
                    {filtered.map((b, index) => (
                        <div
                            key={b.id}
                            data-index={index}
                            role="option"
                            aria-selected={index === highlight}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(b)}
                            onMouseEnter={() => setHighlight(index)}
                            className={`flex cursor-pointer items-center justify-between gap-2 border-b px-3 py-1.5 text-sm last:border-0 ${index === highlight ? 'bg-accent text-accent-foreground' : ''}`}
                        >
                            <span className="truncate">
                                {b.batch_number}
                                {b.expiry_date && <span className="ml-2 text-xs text-muted-foreground">exp {b.expiry_date}</span>}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">restock · {fmtQty(b.qty_available)}</span>
                        </div>
                    ))}
                    {showCreate && (
                        <div
                            data-index={createIndex}
                            role="option"
                            aria-selected={highlight === createIndex}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => create(query)}
                            onMouseEnter={() => setHighlight(createIndex)}
                            className={`cursor-pointer px-3 py-1.5 text-sm ${highlight === createIndex ? 'bg-accent text-accent-foreground' : ''}`}
                        >
                            Create new batch: <span className="font-medium">{query.trim()}</span>
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
