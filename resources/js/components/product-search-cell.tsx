import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { amount, qty } from '@/lib/format';
import { useEffect, useRef, useState } from 'react';

export interface ProductHit {
    id: number;
    name: string;
    generic_name: string | null;
    company: string | null;
    pack_size: string | null;
    purchase_price: number;
    trade_price: number;
    retail_price: number;
    tax_percent: number;
    default_discount_percent: number;
    stock: number;
}

interface Props {
    value: string; // selected product name, shown while the dropdown is closed
    warehouseId: number;
    companyId?: number;
    disabled?: boolean;
    /** Increment to force-open the dropdown (F2 pressed elsewhere in the row). */
    openSignal?: number;
    onSelect: (product: ProductHit) => void;
    /** Grid navigation handler — receives keys only while the dropdown is closed. */
    onGridKeyDown: (e: React.KeyboardEvent) => void;
    /** useKeyboardGrid registerCell ref for this cell. */
    inputRef: (el: HTMLElement | null) => void;
}

const GRID_COLS = 'grid grid-cols-[minmax(14rem,1fr)_5rem_11rem_6rem_6rem] items-center gap-2 px-3';

/**
 * Desktop-ERP style product combobox: type in the grid cell itself, results
 * appear as a table dropdown under it. ↑↓ move the highlight, Enter selects,
 * Esc closes. While closed, all keys flow to the invoice grid's handler.
 */
export function ProductSearchCell({
    value, warehouseId, companyId, disabled, openSignal, onSelect, onGridKeyDown, inputRef,
}: Props) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductHit[]>([]);
    const [highlight, setHighlight] = useState(0);
    const [loading, setLoading] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);
    const localInput = useRef<HTMLInputElement | null>(null);

    // F2 from another cell in the row: focus + open.
    const lastSignal = useRef(openSignal ?? 0);
    useEffect(() => {
        if (openSignal && openSignal !== lastSignal.current) {
            lastSignal.current = openSignal;
            localInput.current?.focus();
            openDropdown();
        }
    }, [openSignal]); // eslint-disable-line react-hooks/exhaustive-deps

    // Debounced search while open.
    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const timeout = setTimeout(async () => {
            setLoading(true);
            try {
                const params = new URLSearchParams({ q: query, warehouse_id: String(warehouseId) });
                if (companyId) params.set('company_id', String(companyId));
                const response = await fetch(`/lookup/products?${params}`, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (response.ok) {
                    setResults(await response.json());
                    setHighlight(0);
                }
            } catch {
                /* aborted */
            } finally {
                setLoading(false);
            }
        }, 200);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [query, open, warehouseId, companyId]);

    // Keep the highlighted row visible.
    useEffect(() => {
        listRef.current
            ?.querySelector(`[data-index="${highlight}"]`)
            ?.scrollIntoView({ block: 'nearest' });
    }, [highlight]);

    const openDropdown = () => {
        setQuery('');
        setResults([]);
        setHighlight(0);
        setOpen(true);
    };

    const select = (product: ProductHit) => {
        setOpen(false);
        setQuery('');
        onSelect(product);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (open) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                e.stopPropagation();
                setHighlight((h) => Math.min(h + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                e.stopPropagation();
                setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (results[highlight]) select(results[highlight]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                setQuery('');
            } else if (e.key === 'Tab') {
                setOpen(false);
                setQuery('');
            } else if (e.key === 'F2') {
                e.preventDefault();
            }
            return;
        }

        if (e.key === 'F2' || (e.key === 'Enter' && !value)) {
            e.preventDefault();
            openDropdown();
            return;
        }

        onGridKeyDown(e);
    };

    return (
        <Popover open={open}>
            <PopoverAnchor asChild>
                <Input
                    ref={(el) => {
                        localInput.current = el;
                        inputRef(el);
                    }}
                    value={open ? query : value}
                    disabled={disabled}
                    placeholder="Type to search… (F2)"
                    onChange={(e) => {
                        if (!open) setOpen(true);
                        setQuery(e.target.value);
                    }}
                    onKeyDown={handleKeyDown}
                    className="h-8 rounded-none border-0 px-2 text-sm focus-visible:ring-1"
                    autoComplete="off"
                />
            </PopoverAnchor>
            <PopoverContent
                align="start"
                sideOffset={2}
                className="w-[44rem] max-w-[90vw] p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={() => {
                    setOpen(false);
                    setQuery('');
                }}
            >
                <div className={`${GRID_COLS} border-b bg-muted/50 py-1.5 text-[11px] font-semibold uppercase text-muted-foreground`}>
                    <span>Product Name</span>
                    <span className="text-right">Stock</span>
                    <span>Supplier</span>
                    <span className="text-right">Pur Price</span>
                    <span className="text-right">Sale Price</span>
                </div>
                <div ref={listRef} className="max-h-72 overflow-y-auto">
                    {results.length === 0 && (
                        <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                            {loading ? 'Searching…' : 'No products found.'}
                        </p>
                    )}
                    {results.map((product, index) => (
                        <div
                            key={product.id}
                            data-index={index}
                            role="option"
                            aria-selected={index === highlight}
                            onMouseDown={(e) => e.preventDefault()} // keep focus in the cell
                            onClick={() => select(product)}
                            onMouseEnter={() => setHighlight(index)}
                            className={`${GRID_COLS} cursor-pointer border-b py-1.5 text-sm last:border-0 ${
                                index === highlight ? 'bg-accent text-accent-foreground' : ''
                            }`}
                        >
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{product.name}</span>
                                {(product.generic_name || product.pack_size) && (
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {[product.generic_name, product.pack_size].filter(Boolean).join(' · ')}
                                    </span>
                                )}
                            </span>
                            <span className={`text-right tabular-nums ${product.stock <= 0 ? 'text-destructive' : ''}`}>
                                {qty(product.stock)}
                            </span>
                            <span className="truncate text-muted-foreground">{product.company ?? '—'}</span>
                            <span className="text-right tabular-nums">{amount(product.purchase_price)}</span>
                            <span className="text-right tabular-nums">{amount(product.trade_price)}</span>
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
