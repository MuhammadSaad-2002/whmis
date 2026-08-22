import {
    CommandDialog, CommandEmpty, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { usePermissions } from '@/hooks/use-permissions';
import { amount, qty } from '@/lib/format';
import { useEffect, useState } from 'react';

export interface ProductHit {
    id: number;
    name: string;
    generic_name: string | null;
    company: string | null;
    pack_size: string | null;
    /** Omitted by the API for roles without products.view_cost (e.g. Bookers). */
    purchase_price?: number;
    trade_price: number;
    retail_price: number;
    tax_percent: number;
    default_discount_percent: number;
    stock: number;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    warehouseId: number;
    companyId?: number;
    onSelect: (product: ProductHit) => void;
}

/**
 * Modal product search (used where there is no grid cell to anchor to,
 * e.g. purchase returns). Same table columns as ProductSearchCell.
 */
export function ProductSearchDialog({ open, onOpenChange, warehouseId, companyId, onSelect }: Props) {
    const { can } = usePermissions();
    const showCost = can('products.view_cost');
    // Stacks into a single card row on phones; becomes a table grid from `sm` up.
    const gridCols = showCost
        ? 'sm:grid sm:grid-cols-[minmax(11rem,1fr)_4.5rem_9rem_5.5rem_5.5rem_5.5rem] sm:items-center sm:gap-2'
        : 'sm:grid sm:grid-cols-[minmax(12rem,1fr)_5rem_10rem_6rem_6rem] sm:items-center sm:gap-2';
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductHit[]>([]);
    const [loading, setLoading] = useState(false);

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
                if (response.ok) setResults(await response.json());
            } catch {
                /* aborted or offline — keep previous results */
            } finally {
                setLoading(false);
            }
        }, 200);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [query, open, warehouseId, companyId]);

    useEffect(() => {
        if (!open) setQuery('');
    }, [open]);

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange} contentClassName="sm:max-w-3xl">
            <CommandInput placeholder="Type product name, generic, or scan barcode…" value={query} onValueChange={setQuery} />
            <div className={`${gridCols} hidden border-b bg-muted/50 px-4 py-1.5 text-[11px] font-semibold uppercase text-muted-foreground sm:grid`}>
                <span>Product Name</span>
                <span className="text-right">Stock</span>
                <span>Supplier</span>
                {showCost && <span className="text-right">Pur Price</span>}
                <span className="text-right">Trade</span>
                <span className="text-right">Retail</span>
            </div>
            <CommandList>
                <CommandEmpty>{loading ? 'Searching…' : 'No products found.'}</CommandEmpty>
                {results.map((product) => (
                    <CommandItem
                        key={product.id}
                        value={`${product.name} ${product.generic_name ?? ''} ${product.id}`}
                        onSelect={() => {
                            onSelect(product);
                            onOpenChange(false);
                        }}
                        className={`${gridCols} !py-2`}
                    >
                        <span className="min-w-0">
                            <span className="block truncate font-medium">{product.name}</span>
                            {(product.generic_name || product.pack_size) && (
                                <span className="block truncate text-xs text-muted-foreground">
                                    {[product.generic_name, product.pack_size].filter(Boolean).join(' · ')}
                                </span>
                            )}
                        </span>
                        <span className={`hidden text-right tabular-nums sm:block ${product.stock <= 0 ? 'text-destructive' : ''}`}>
                            {qty(product.stock)}
                        </span>
                        <span className="hidden truncate text-muted-foreground sm:block">{product.company ?? '—'}</span>
                        {showCost && <span className="hidden text-right tabular-nums sm:block">{amount(product.purchase_price ?? 0)}</span>}
                        <span className="hidden text-right tabular-nums sm:block">{amount(product.trade_price)}</span>
                        <span className="hidden text-right tabular-nums sm:block">{amount(product.retail_price)}</span>
                        {/* Phone-only summary line — the grid columns above are hidden below sm. */}
                        <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground sm:hidden">
                            <span className={product.stock <= 0 ? 'text-destructive' : ''}>Stock {qty(product.stock)}</span>
                            <span>{product.company ?? '—'}</span>
                            {showCost && <span>Cost {amount(product.purchase_price ?? 0)}</span>}
                            <span>TP {amount(product.trade_price)}</span>
                            <span>RP {amount(product.retail_price)}</span>
                        </span>
                    </CommandItem>
                ))}
            </CommandList>
        </CommandDialog>
    );
}
