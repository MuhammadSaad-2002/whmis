import {
    Command, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { type ProductHit } from '@/components/product-search-cell';
import { usePermissions } from '@/hooks/use-permissions';
import { amount, qty } from '@/lib/format';
import { ChevronRight, PackageSearch, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import './product-search-dialog.css';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    warehouseId: number;
    companyId?: number;
    includeSupplierDetails: boolean;
    onSelect: (product: ProductHit) => void;
}

export function ProductSearchDialog({ open, onOpenChange, warehouseId, companyId, includeSupplierDetails, onSelect }: Props) {
    const { can, canViewSupplierDetails } = usePermissions();
    const showSupplier = includeSupplierDetails && canViewSupplierDetails;
    const showCost = showSupplier && can('products.view_cost');
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductHit[]>([]);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const opener = useRef<HTMLElement | null>(null);
    const [content, setContent] = useState<HTMLDivElement | null>(null);
    const title = useRef<HTMLHeadingElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const list = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const frame = window.frameElement;
        const viewport = frame ? window.parent.visualViewport : window.visualViewport;
        if (!open || !viewport || !content) return;
        // The picker runs inside the workspace frame. Mobile keyboards resize
        // the outer visual viewport; clip it to the frame's visible bounds.
        const fitViewport = () => {
            const bounds = frame?.getBoundingClientRect();
            const top = Math.max(0, viewport.offsetTop - (bounds?.top ?? 0));
            const bottom = Math.min(window.innerHeight, viewport.offsetTop + viewport.height - (bounds?.top ?? 0));
            content.style.setProperty('--picker-height', `${Math.max(0, bottom - top)}px`);
            content.style.setProperty('--picker-top', `${top}px`);
        };
        fitViewport();
        viewport.addEventListener('resize', fitViewport);
        viewport.addEventListener('scroll', fitViewport);
        return () => {
            viewport.removeEventListener('resize', fitViewport);
            viewport.removeEventListener('scroll', fitViewport);
        };
    }, [open, content]);

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

    const search = (value: string) => {
        if (value === query) return;
        setLoading(true);
        setQuery(value);
        if (list.current) list.current.scrollTop = 0;
    };

    const status = loading ? 'Searching…' : failed ? 'Couldn’t load products' : results.length === 0
        ? 'No products found' : results.length === 20 ? 'Showing up to 20 matches' : `${results.length} ${results.length === 1 ? 'product' : 'products'}`;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                ref={setContent}
                className="booking-product-picker flex max-w-none translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-card p-0 sm:max-w-xl sm:rounded-2xl sm:border [&>button]:top-2 [&>button]:right-3 [&>button]:grid [&>button]:size-11 [&>button]:place-items-center [&>button]:rounded-lg"
                onOpenAutoFocus={(event) => {
                    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                    event.preventDefault();
                    title.current?.focus({ preventScroll: true });
                }}
                onCloseAutoFocus={(event) => {
                    if (opener.current?.isConnected) {
                        event.preventDefault();
                        opener.current.focus({ preventScroll: true });
                    }
                }}
            >
                <div className="shrink-0 px-4 pt-5 pb-3.5 pr-16">
                    <DialogTitle ref={title} tabIndex={-1} className="text-xl focus:outline-none">Select product</DialogTitle>
                    <DialogDescription className="sr-only">Search by product name, generic name, or barcode.</DialogDescription>
                </div>
                <Command shouldFilter={false} className="min-h-0 flex-1 rounded-none bg-card text-foreground">
                    <div className="shrink-0 border-b px-4">
                        <div className="relative [&_[cmdk-input-wrapper]]:rounded-xl [&_[cmdk-input-wrapper]]:border [&_[cmdk-input-wrapper]]:bg-background">
                            <CommandInput
                                ref={input}
                                aria-label="Search products"
                                placeholder="Name, generic or barcode"
                                className={query ? 'h-12 pr-9 text-base' : 'h-12 text-base'}
                                value={query}
                                onValueChange={search}
                                autoComplete="off"
                                autoCapitalize="none"
                                spellCheck={false}
                            />
                            {query && <button type="button" aria-label="Clear search"
                                className="absolute inset-y-0 right-1 my-auto grid size-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
                                onClick={() => { search(''); input.current?.focus(); }}>
                                <X className="size-4" aria-hidden="true" />
                            </button>}
                        </div>
                        <p role="status" className="py-2.5 text-xs font-medium text-muted-foreground">{status}</p>
                    </div>
                    <CommandList ref={list} label="Products" aria-busy={loading}
                        className="max-h-none min-h-0 flex-1 overscroll-contain bg-muted/35 px-3 [padding-bottom:max(0.75rem,env(safe-area-inset-bottom))]">
                        {!loading && (failed || results.length === 0) && (
                            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted-foreground">
                                <PackageSearch className="size-7" aria-hidden="true" />
                                {failed ? 'Check your connection and try searching again.' : 'Try a different product name, generic name, or barcode.'}
                            </div>
                        )}
                        {!loading && !failed && results.map((product) => (
                            <CommandItem
                                key={product.id}
                                value={String(product.id)}
                                onSelect={() => {
                                    onSelect(product);
                                    onOpenChange(false);
                                }}
                                className="mt-2 block cursor-pointer rounded-xl border bg-card p-3"
                            >
                                <span className="flex items-center justify-between gap-2">
                                    <span className="font-semibold [overflow-wrap:anywhere]">{product.name}</span>
                                    <ChevronRight className="shrink-0 text-muted-foreground" aria-hidden="true" />
                                </span>
                                {product.generic_name && <span className="mt-0.5 block text-xs text-muted-foreground [overflow-wrap:anywhere]">{product.generic_name}</span>}
                                <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                                    <span className={`rounded-md px-2 py-1 font-semibold tabular-nums ${product.stock > 0
                                        ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/70 dark:text-emerald-100'
                                        : 'bg-destructive/10 text-destructive'}`}>
                                        {product.stock > 0 ? `${qty(product.stock)} in stock` : 'Out of stock'}
                                    </span>
                                    {product.pack_size && <span>Pack: {product.pack_size}</span>}
                                </span>
                                <span className="mt-2 grid grid-cols-2 gap-2 border-t pt-2 text-xs tabular-nums">
                                    <span className="min-w-0 text-muted-foreground">Trade <strong className="text-sm font-semibold text-foreground">Rs {amount(product.trade_price)}</strong></span>
                                    <span className="min-w-0 text-muted-foreground">Retail <strong className="text-sm font-medium text-foreground">Rs {amount(product.retail_price)}</strong></span>
                                </span>
                                {showSupplier && (product.company || showCost) && <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                                    {product.company && <span>{product.company}</span>}
                                    {showCost && <span>Cost {amount(product.purchase_price ?? 0)}</span>}
                                </span>}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </DialogContent>
        </Dialog>
    );
}
