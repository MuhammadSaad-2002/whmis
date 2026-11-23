import {
    Command, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type ProductHit } from '@/components/product-search-cell';
import { usePermissions } from '@/hooks/use-permissions';
import { amount, qty } from '@/lib/format';
import { useEffect, useRef, useState } from 'react';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    warehouseId: number;
    companyId?: number;
    onSelect: (product: ProductHit) => void;
}

export function ProductSearchDialog({ open, onOpenChange, warehouseId, companyId, onSelect }: Props) {
    const { can, canViewSupplierDetails: showSupplier } = usePermissions();
    const showCost = showSupplier && can('products.view_cost');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductHit[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const opener = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const timeout = setTimeout(async () => {
            try {
                const params = new URLSearchParams({ q: query, warehouse_id: String(warehouseId) });
                if (companyId) params.set('company_id', String(companyId));
                const response = await fetch(`/lookup/products?${params}`, {
                    signal: controller.signal,
                    headers: { Accept: 'application/json' },
                });
                if (!response.ok) throw new Error('Product lookup failed');
                const products: ProductHit[] = await response.json();
                if (!controller.signal.aborted) {
                    setResults(products);
                    setFailed(false);
                }
            } catch {
                if (!controller.signal.aborted) setFailed(true);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 200);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [query, open, warehouseId, companyId]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="top-3 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1rem)] translate-y-0 flex-col gap-0 overflow-hidden rounded-xl p-0 sm:top-1/2 sm:max-w-lg sm:-translate-y-1/2 [&>button]:top-1 [&>button]:right-2 [&>button]:grid [&>button]:size-11 [&>button]:place-items-center"
                onOpenAutoFocus={() => { opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
                onCloseAutoFocus={(event) => {
                    if (opener.current?.isConnected) {
                        event.preventDefault();
                        opener.current.focus({ preventScroll: true });
                    }
                }}
            >
                <div className="shrink-0 border-b px-4 py-3.5 pr-14">
                    <DialogTitle>Select product</DialogTitle>
                    <DialogDescription className="sr-only">Search by product name, generic name, or barcode.</DialogDescription>
                </div>
                <Command shouldFilter={false} className="min-h-0 rounded-none">
                    <CommandInput
                        aria-label="Search products"
                        placeholder="Name, generic or barcode"
                        className="h-12 text-base"
                        value={query}
                        onValueChange={(value) => {
                            setQuery(value);
                            setLoading(true);
                        }}
                    />
                    {(loading || failed || results.length === 0) && (
                        <p role="status" className="p-4 text-sm text-muted-foreground">
                            {loading ? 'Searching…' : failed ? 'Could not load products. Try another search.' : 'No products found.'}
                        </p>
                    )}
                    <CommandList className="max-h-[55dvh] min-h-0 overscroll-contain px-2">
                        {!loading && !failed && results.map((product) => (
                            <CommandItem
                                key={product.id}
                                value={String(product.id)}
                                onSelect={() => {
                                    onSelect(product);
                                    onOpenChange(false);
                                }}
                                className="my-1 block min-h-12 cursor-pointer rounded-lg px-2.5 py-2.5"
                            >
                                <span className="block font-semibold [overflow-wrap:anywhere]">{product.name}</span>
                                {(product.generic_name || product.pack_size) && (
                                    <span className="block text-xs text-muted-foreground">
                                        {[product.generic_name, product.pack_size].filter(Boolean).join(' · ')}
                                    </span>
                                )}
                                <span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                                    <span className={product.stock <= 0 ? 'text-destructive' : ''}>Stock {qty(product.stock)}</span>
                                    <span>Trade {amount(product.trade_price)}</span>
                                    <span>Retail {amount(product.retail_price)}</span>
                                    {showSupplier && product.company && <span>{product.company}</span>}
                                    {showCost && <span>Cost {amount(product.purchase_price ?? 0)}</span>}
                                </span>
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
